from __future__ import annotations

from datetime import datetime
from typing import Any

from app.schemas.payload import TransactionPayload


class FeatureService:
    @staticmethod
    def extract(payload: TransactionPayload, model_features: dict[str, Any] | None = None) -> dict[str, Any]:
        raw_ts = str(payload.timestamp or "").strip()
        step = getattr(payload, "timeStep", None)
        if step is None and raw_ts.lower().startswith("step "):
            try:
                step = int(raw_ts.split()[1])
            except (IndexError, ValueError):
                step = 0

        if step is not None:
            hour = int(step) % 24
            day_of_week = (int(step) // 24) % 7
        else:
            try:
                parsed = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                hour = parsed.hour
                day_of_week = parsed.weekday()
            except Exception:
                hour = 12
                day_of_week = 0

        unusual_hour = hour < 6 or hour >= 22

        amount_val = float(payload.amount or 0.0)
        amount_signal = min(100, max(10, int(round(amount_val / 2500))))
        device_signal = 18 if payload.deviceId else 0
        location_signal = 20 if payload.location and str(payload.location).lower() != "unknown" else 12
        ip_val = str(payload.ipAddress or "")
        ip_signal = 25 if ip_val.startswith(("203.", "198.", "10.")) else 18
        tx_type = str(payload.transactionType or "TRANSFER").upper()
        transaction_type_signal = 35 if tx_type == "WIRE" else 50 if tx_type == "CRYPTO" else 25

        timestamp_str = raw_ts or "1970-01-01T00:00:00Z"
        features: dict[str, Any] = {
            "amount": amount_val,
            "transactionType": tx_type,
            "currency": payload.currency or "USD",
            "transactionHour": hour,
            "dayOfWeek": day_of_week,
            "unusualHour": unusual_hour,
            "location": payload.location or "US",
            "deviceId": payload.deviceId or "",
            "ipAddress": ip_val,
            "merchantId": payload.merchantId or "",
            "amountSignal": amount_signal,
            "deviceSignal": device_signal,
            "locationSignal": location_signal,
            "ipSignal": ip_signal,
            "transactionTypeSignal": transaction_type_signal,
            "step": step if step is not None else hour,
            "type": tx_type,
            "oldbalanceOrg": getattr(payload, "oldbalanceOrg", 0.0) or 0.0,
            "newbalanceOrig": getattr(payload, "newbalanceOrig", 0.0) or 0.0,
            "oldbalanceDest": getattr(payload, "oldbalanceDest", 0.0) or 0.0,
            "newbalanceDest": getattr(payload, "newbalanceDest", 0.0) or 0.0,
            "timestamp": timestamp_str,
            "evidence": [
                {
                    "id": "feat-amount",
                    "label": "Transaction amount",
                    "description": f"Amount {amount_val} {payload.currency or 'USD'} was received for a {tx_type} transaction.",
                    "strength": min(100, max(10, amount_signal)),
                    "source": "feature_engine",
                    "timestamp": timestamp_str,
                    "relationship": "transaction",
                },
                {
                    "id": "feat-time",
                    "label": "Transaction hour",
                    "description": f"Transaction occurred at hour {hour} with unusual-hour flag {str(unusual_hour).lower()}",
                    "strength": 50 if unusual_hour else 20,
                    "source": "feature_engine",
                    "timestamp": timestamp_str,
                    "relationship": "temporal",
                },
                {
                    "id": "feat-device",
                    "label": "Device identifier",
                    "description": f"Device identifier present: {payload.deviceId or 'NONE'}",
                    "strength": device_signal,
                    "source": "feature_engine",
                    "timestamp": timestamp_str,
                    "relationship": "device",
                },
                {
                    "id": "feat-location",
                    "label": "Location",
                    "description": f"Location captured as {payload.location or 'US'}",
                    "strength": location_signal,
                    "source": "feature_engine",
                    "timestamp": timestamp_str,
                    "relationship": "location",
                },
                {
                    "id": "feat-ip",
                    "label": "IP address",
                    "description": f"IP address captured as {ip_val or 'UNAVAILABLE'}",
                    "strength": ip_signal,
                    "source": "feature_engine",
                    "timestamp": timestamp_str,
                    "relationship": "network",
                },
            ],
        }
        if model_features:
            features.update(model_features)
        return features
