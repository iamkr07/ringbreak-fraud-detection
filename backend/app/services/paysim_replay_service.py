from __future__ import annotations

import csv
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from math import isfinite
from pathlib import Path
from threading import Lock
from time import time
from typing import Any, Callable

from app.schemas.payload import TransactionPayload

CSV_NAME = "PS_20174392719_1491204439457_log.csv"
MODEL_FEATURE_KEYS = (
    "step",
    "type",
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
)
CSV_REQUIRED_FIELDS = set(MODEL_FEATURE_KEYS) | {
    "nameOrig",
    "nameDest",
    "isFraud",
    "isFlaggedFraud",
}
TRANSACTION_TYPES = {
    "TRANSFER": "WIRE",
    "PAYMENT": "P2P",
    "CASH_IN": "INTERNAL",
    "CASH_OUT": "INTERNAL",
    "DEBIT": "INTERNAL",
}
PRESETS = {
    "paysim_benign_row_2": {
        "name": "Benign",
        "description": "Next eligible PaySim record with isFraud=0.",
        "category": "normal",
        "groundTruth": 0,
    },
    "paysim_fraud_row_4": {
        "name": "Fraud-labelled",
        "description": "Next eligible PaySim record with isFraud=1.",
        "category": "malicious",
        "groundTruth": 1,
    },
}
PROCESSOR = Callable[[TransactionPayload, dict[str, Any], dict[str, Any]], Any]


class ReplayAlreadyRunning(RuntimeError):
    pass


class PaySimReplayService:
    def __init__(self) -> None:
        self.csv_path = Path(__file__).resolve().parents[3] / CSV_NAME
        self._run_lock = Lock()
        self._status_lock = Lock()
        self._preview_lock = Lock()
        self._cursor_by_label: dict[int, int] = {}
        self._last_sample_by_label: dict[int, frozenset[int]] = {}
        self._samples: dict[str, dict[str, Any]] = {}
        self._previews: dict[str, dict[str, Any]] = {}
        self._status: dict[str, Any] = {
            "source": "PaySim Dataset Replay",
            "datasetFile": CSV_NAME,
            "status": "idle",
            "maxRows": 0,
            "startRowNumber": 2,
            "processedRows": 0,
            "succeededRows": 0,
            "failedRows": 0,
            "datasetExhausted": False,
            "latestEventId": None,
            "latestTraceId": None,
            "latestInvestigationId": None,
            "error": None,
        }

    @staticmethod
    def map_row(row: dict[str, str], row_number: int) -> tuple[TransactionPayload, dict[str, Any], dict[str, Any]]:
        raw_type = str(row.get("type", "")).strip().upper()
        if raw_type not in TRANSACTION_TYPES:
            raise ValueError(f"Unsupported PaySim transaction type at row {row_number}: {raw_type}")

        def number(field: str) -> float:
            value = float(row[field])
            if not isfinite(value):
                raise ValueError(f"Non-finite {field} at row {row_number}")
            return value

        step = int(row["step"])
        timestamp = (datetime(2000, 1, 1, tzinfo=timezone.utc) + timedelta(hours=step)).isoformat().replace("+00:00", "Z")
        account_sender = row["nameOrig"].strip()
        account_receiver = row["nameDest"].strip()
        if not account_sender or not account_receiver:
            raise ValueError(f"Missing PaySim account identifier at row {row_number}")

        amount = number("amount")
        transaction = TransactionPayload(
            senderAccount=account_sender,
            receiverAccount=account_receiver,
            amount=amount,
            currency="USD",
            deviceId=f"PAYSIM-REPLAY-DEVICE-{row_number}",
            ipAddress=f"PAYSIM-REPLAY-IP-{row_number}",
            location="PaySim replay context (derived)",
            merchantId=f"PAYSIM-REPLAY-MERCHANT-{row_number}",
            transactionType=TRANSACTION_TYPES[raw_type],
            timestamp=timestamp,
        )
        model_features: dict[str, Any] = {
            "step": step,
            "type": raw_type,
            "amount": amount,
            "oldbalanceOrg": number("oldbalanceOrg"),
            "newbalanceOrig": number("newbalanceOrig"),
            "oldbalanceDest": number("oldbalanceDest"),
            "newbalanceDest": number("newbalanceDest"),
        }
        replay_metadata = {
            "source": "PaySim Dataset Replay",
            "csvRowNumber": row_number,
            "sourceRow": dict(row),
            "groundTruth": {
                "isFraud": int(row["isFraud"]),
                "isFlaggedFraud": int(row["isFlaggedFraud"]),
            },
            "derivedContext": {
                "currency": "USD",
                "deviceId": transaction.deviceId,
                "ipAddress": transaction.ipAddress,
                "location": transaction.location,
                "merchantId": transaction.merchantId,
                "transactionType": transaction.transactionType,
                "timestamp": timestamp,
            },
        }
        return transaction, model_features, replay_metadata

    def get_status(self) -> dict[str, Any]:
        with self._status_lock:
            return dict(self._status)

    def _read_row(self, row_number: int) -> dict[str, str] | None:
        with self.csv_path.open("r", newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.reader(csv_file)
            fields = next(reader, [])
            missing = CSV_REQUIRED_FIELDS - set(fields)
            if missing:
                raise ValueError(f"PaySim CSV is missing required columns: {', '.join(sorted(missing))}")
            for current_row_number, values in enumerate(reader, start=2):
                if current_row_number == row_number:
                    return dict(zip(fields, values))
        return None

    def _file_signature(self) -> tuple[int, int]:
        stat = self.csv_path.stat()
        return stat.st_mtime_ns, stat.st_size

    @staticmethod
    def _row_signature(row: dict[str, str]) -> str:
        encoded = json.dumps(row, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def sample_rows(
        self,
        ground_truth: int,
        refresh_token: str | None = None,
        invalidate_sample_token: str | None = None,
    ) -> dict[str, Any]:
        if ground_truth not in (0, 1):
            raise ValueError("isFraud must be 0 or 1")
        if not self.csv_path.is_file():
            raise FileNotFoundError(f"PaySim CSV not found: {self.csv_path}")

        preset_id = next(key for key, preset in PRESETS.items() if preset["groundTruth"] == ground_truth)
        with self._preview_lock:
            self._cleanup_previews()
            if refresh_token:
                binding = self._previews.get(refresh_token)
                if binding is not None and binding["presetId"] == preset_id:
                    self._previews.pop(refresh_token, None)
            if invalidate_sample_token:
                self._samples.pop(invalidate_sample_token, None)
                stale_previews = [
                    token
                    for token, binding in self._previews.items()
                    if binding.get("sampleToken") == invalidate_sample_token
                ]
                for token in stale_previews:
                    self._previews.pop(token, None)

            signature = self._file_signature()
            previous = self._last_sample_by_label.get(ground_truth)
            chooser = secrets.SystemRandom()
            while True:
                selected: list[tuple[int, dict[str, str]]] = []
                eligible_count = 0
                with self.csv_path.open("r", newline="", encoding="utf-8-sig") as csv_file:
                    reader = csv.reader(csv_file)
                    fields = next(reader, [])
                    missing = CSV_REQUIRED_FIELDS - set(fields)
                    if missing:
                        raise ValueError(f"PaySim CSV is missing required columns: {', '.join(sorted(missing))}")
                    fraud_column = fields.index("isFraud")
                    flagged_column = fields.index("isFlaggedFraud")
                    for row_number, values in enumerate(reader, start=2):
                        if int(values[fraud_column]) != ground_truth:
                            continue
                        eligible_count += 1
                        candidate = (row_number, dict(zip(fields, values)))
                        if len(selected) < 5:
                            selected.append(candidate)
                        else:
                            replacement_index = chooser.randrange(eligible_count)
                            if replacement_index < 5:
                                selected[replacement_index] = candidate

                if not selected:
                    raise ValueError(f"No PaySim rows found with isFraud={ground_truth}")
                row_numbers = frozenset(row_number for row_number, _ in selected)
                if len(selected) < 5 or previous is None or row_numbers != previous or eligible_count <= 5:
                    break

            if self._file_signature() != signature:
                raise RuntimeError("PaySim source changed while samples were being read")
            self._last_sample_by_label[ground_truth] = row_numbers
            sampled_rows = [
                {
                    "sourceRowNumber": row_number,
                    "sourceRow": row,
                    "groundTruth": {
                        "isFraud": ground_truth,
                        "isFlaggedFraud": int(row["isFlaggedFraud"]),
                    },
                }
                for row_number, row in selected
            ]
            sample_token = secrets.token_urlsafe(32)
            self._samples[sample_token] = {
                "createdAt": time(),
                "presetId": preset_id,
                "groundTruth": ground_truth,
                "sourceSignature": signature,
                "rows": {row["sourceRowNumber"]: row for row in sampled_rows},
            }
            return {"isFraud": ground_truth, "sampleToken": sample_token, "rows": sampled_rows}

    def _next_eligible_row(self, ground_truth: int, advance: bool = True) -> tuple[int, dict[str, str]]:
        if not self.csv_path.is_file():
            raise FileNotFoundError(f"PaySim CSV not found: {self.csv_path}")

        cursor = self._cursor_by_label.get(ground_truth, 0)
        target_index = cursor
        found: tuple[int, dict[str, str]] | None = None
        eligible_count = 0
        with self.csv_path.open("r", newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.reader(csv_file)
            fields = next(reader, [])
            missing = CSV_REQUIRED_FIELDS - set(fields)
            if missing:
                raise ValueError(f"PaySim CSV is missing required columns: {', '.join(sorted(missing))}")
            fraud_column = fields.index("isFraud")
            for row_number, values in enumerate(reader, start=2):
                if int(values[fraud_column]) != ground_truth:
                    continue
                if eligible_count == target_index:
                    found = (row_number, dict(zip(fields, values)))
                    break
                eligible_count += 1

        if found is None:
            if cursor == 0:
                raise ValueError(f"No PaySim rows found with isFraud={ground_truth}")
            self._cursor_by_label[ground_truth] = 0
            return self._next_eligible_row(ground_truth, advance)

        row_number, row = found
        if advance:
            self._cursor_by_label[ground_truth] = cursor + 1
        return row_number, row

    def get_row_preview(self, row_number: int, ground_truth: int) -> dict[str, Any]:
        if ground_truth not in (0, 1):
            raise ValueError("isFraud must be 0 or 1")
        preset_id = next(key for key, preset in PRESETS.items() if preset["groundTruth"] == ground_truth)
        signature = self._file_signature()
        row = self._read_row(row_number)
        if row is None:
            raise ValueError(f"PaySim source row {row_number} does not exist")
        if int(row["isFraud"]) != ground_truth:
            raise ValueError("Selected PaySim row does not match the requested class")
        if self._file_signature() != signature:
            raise RuntimeError("PaySim source changed while the row was being previewed")
        return self._build_preview(preset_id, row_number, row, signature)

    def get_sample_row_preview(self, sample_token: str, row_number: int, ground_truth: int) -> dict[str, Any]:
        preset_id = next(key for key, preset in PRESETS.items() if preset["groundTruth"] == ground_truth)
        with self._preview_lock:
            self._cleanup_previews()
            sample = self._samples.get(sample_token)
            if sample is None:
                raise KeyError("PaySim sample is invalid or expired; refresh the class sample")
            if sample["presetId"] != preset_id or sample["groundTruth"] != ground_truth:
                raise ValueError("PaySim sample does not belong to the requested class")
            if self._file_signature() != sample["sourceSignature"]:
                self._samples.pop(sample_token, None)
                raise ValueError("PaySim source changed after sampling; refresh the class sample")
            sampled_row = sample["rows"].get(row_number)
            if sampled_row is None:
                raise ValueError("Selected row is not part of this PaySim sample")
            return self._build_preview(
                preset_id,
                row_number,
                sampled_row["sourceRow"],
                sample["sourceSignature"],
                sample_token,
            )

    def _build_preview(
        self,
        preset_id: str,
        row_number: int,
        row: dict[str, str],
        source_signature: tuple[int, int] | None = None,
        sample_token: str | None = None,
    ) -> dict[str, Any]:
        preset = PRESETS[preset_id]
        transaction, model_features, metadata = self.map_row(row, row_number)
        preview_token = secrets.token_urlsafe(32)
        preview = {
            "id": preset_id,
            "name": preset["name"],
            "description": preset["description"],
            "category": preset["category"],
            "payload": transaction.model_dump(),
            "expectedOutcome": "Actual model output and dataset label shown after investigation.",
            "dataset": CSV_NAME,
            "sourceRowNumber": row_number,
            "sourceRow": dict(row),
            "mappedPayload": transaction.model_dump(),
            "modelFeatures": model_features,
            "groundTruth": metadata["groundTruth"],
            "mapping": "PaySim fields map to transaction payload and MODEL_FEATURE_KEYS; labels are evaluation-only.",
            "derivedContext": metadata["derivedContext"],
            "previewToken": preview_token,
        }
        self._previews[preview_token] = {
            "createdAt": time(),
            "presetId": preset_id,
            "sampleToken": sample_token,
            "sourceRowNumber": row_number,
            "groundTruth": int(preset["groundTruth"]),
            "sourceSignature": source_signature or self._file_signature(),
            "sourceRowSignature": self._row_signature(row),
            "preview": preview,
            "result": None,
        }
        return preview

    def _cleanup_previews(self) -> None:
        cutoff = time() - 600
        expired = [token for token, preview in self._previews.items() if preview["createdAt"] < cutoff]
        for token in expired:
            self._previews.pop(token, None)
        expired_samples = [token for token, sample in self._samples.items() if sample["createdAt"] < cutoff]
        for token in expired_samples:
            self._samples.pop(token, None)

    def get_preset(self, preset_id: str) -> dict[str, Any]:
        preset = PRESETS.get(preset_id)
        if preset is None:
            raise KeyError(f"Unknown PaySim preset: {preset_id}")
        with self._preview_lock:
            self._cleanup_previews()
            row_number, row = self._next_eligible_row(int(preset["groundTruth"]))
            return self._build_preview(preset_id, row_number, row)

    def resolve_preview(self, preset_id: str, preview_token: str) -> tuple[dict[str, Any], Any | None, bool]:
        with self._preview_lock:
            self._cleanup_previews()
            binding = self._previews.get(preview_token)
            if binding is None:
                raise KeyError("Preview token is invalid or expired")
            if binding["presetId"] != preset_id:
                raise ValueError("Preview token does not belong to this preset")
            if binding["result"] is not None:
                return binding["preview"], binding["result"], False
            if self._file_signature() != binding["sourceSignature"]:
                self._previews.pop(preview_token, None)
                raise ValueError("PaySim source changed after preview; select and preview the row again")
            row = binding["preview"]["sourceRow"]
            if (
                binding["preview"]["sourceRowNumber"] != binding["sourceRowNumber"]
                or int(row["isFraud"]) != binding["groundTruth"]
                or self._row_signature(row) != binding["sourceRowSignature"]
            ):
                self._previews.pop(preview_token, None)
                raise ValueError("PaySim source row changed after preview; select and preview the row again")
            binding["result"] = "processing"
            return binding["preview"], None, True

    def revoke_preview(self, preview_token: str) -> None:
        with self._preview_lock:
            self._previews.pop(preview_token, None)

    def peek_preset(self, preset_id: str) -> dict[str, Any]:
        preset = PRESETS.get(preset_id)
        if preset is None:
            raise KeyError(f"Unknown PaySim preset: {preset_id}")
        row_number, row = self._next_eligible_row(int(preset["groundTruth"]), advance=False)
        transaction, _, metadata = self.map_row(row, row_number)
        return {
            "id": preset_id,
            "name": preset["name"],
            "description": preset["description"],
            "category": preset["category"],
            "payload": transaction.model_dump(),
            "expectedOutcome": "Actual model output and dataset label shown after investigation.",
            "sourceDataset": CSV_NAME,
            "sourceRowNumber": row_number,
            "groundTruth": metadata["groundTruth"],
        }

    def store_preview_result(self, preview_token: str, result: Any) -> None:
        with self._preview_lock:
            binding = self._previews.get(preview_token)
            if binding is not None:
                if result == "failed":
                    self._previews.pop(preview_token, None)
                else:
                    binding["result"] = result

    def run(self, max_rows: int, processor: PROCESSOR, start_row_number: int = 2) -> dict[str, Any]:
        if max_rows < 1 or max_rows > 1000:
            raise ValueError("maxRows must be between 1 and 1000")
        if start_row_number < 2:
            raise ValueError("startRowNumber must be 2 or greater")
        if not self._run_lock.acquire(blocking=False):
            raise ReplayAlreadyRunning("A PaySim replay is already running")

        with self._status_lock:
            self._status = {
                "source": "PaySim Dataset Replay",
                "datasetFile": CSV_NAME,
                "status": "running",
                "maxRows": max_rows,
                "startRowNumber": start_row_number,
                "processedRows": 0,
                "succeededRows": 0,
                "failedRows": 0,
                "datasetExhausted": False,
                "latestEventId": None,
                "latestTraceId": None,
                "latestInvestigationId": None,
                "error": None,
            }

        try:
            if not self.csv_path.is_file():
                raise FileNotFoundError(f"PaySim CSV not found: {self.csv_path}")

            with self.csv_path.open("r", newline="", encoding="utf-8-sig") as csv_file:
                reader = csv.DictReader(csv_file)
                missing = CSV_REQUIRED_FIELDS - set(reader.fieldnames or [])
                if missing:
                    raise ValueError(f"PaySim CSV is missing required columns: {', '.join(sorted(missing))}")

                exhausted = True
                for row_number, row in enumerate(reader, start=2):
                    if row_number < start_row_number:
                        continue
                    if self.get_status()["processedRows"] >= max_rows:
                        exhausted = False
                        break
                    with self._status_lock:
                        self._status["processedRows"] += 1
                    try:
                        transaction, model_features, metadata = self.map_row(row, row_number)
                        result = processor(transaction, model_features, metadata)
                    except Exception as exc:
                        with self._status_lock:
                            self._status["failedRows"] += 1
                            self._status["status"] = "error"
                            self._status["error"] = str(exc)
                        break

                    with self._status_lock:
                        self._status["succeededRows"] += 1
                        self._status["latestEventId"] = result.eventId
                        self._status["latestTraceId"] = result.traceId
                        self._status["latestInvestigationId"] = result.investigationId

                with self._status_lock:
                    self._status["datasetExhausted"] = exhausted and self._status["status"] != "error"
                    if self._status["status"] != "error":
                        self._status["status"] = "completed"
        except Exception as exc:
            with self._status_lock:
                self._status["status"] = "error"
                self._status["error"] = str(exc)
        finally:
            self._run_lock.release()

        return self.get_status()


paysim_replay_service = PaySimReplayService()