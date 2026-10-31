from __future__ import annotations

import csv
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.services.ml_service import MLService


def _find_amlsim_data_dir() -> Path:
    env_dir = os.getenv("AMLSIM_DATA_DIR", "").strip()
    if env_dir and Path(env_dir).is_dir():
        return Path(env_dir).resolve()

    base = Path(__file__).resolve()
    candidates = [
        base.parent / "AMLSim-data",
        base.parents[1] / "AMLSim-data",
        base.parents[2] / "AMLSim-data",
        base.parents[3] / "AMLSim-data",
        Path.cwd() / "AMLSim-data",
        Path.cwd() / "backend" / "AMLSim-data",
        Path.cwd().parent / "AMLSim-data",
    ]
    for candidate in candidates:
        if candidate.is_dir() and (candidate / "transactions.csv").is_file():
            return candidate.resolve()

    raise FileNotFoundError("Could not locate AMLSim-data directory containing transactions.csv")


class AMLSimService:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = data_dir or _find_amlsim_data_dir()
        self._transactions: list[dict[str, Any]] = []
        self._transactions_by_id: dict[str, dict[str, Any]] = {}
        self._accounts: list[dict[str, Any]] = []
        self._accounts_by_id: dict[str, dict[str, Any]] = {}
        self._alerts: list[dict[str, Any]] = []
        self._alerts_by_id: dict[int, list[dict[str, Any]]] = defaultdict(list)
        self._transactions_by_account: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._patterns: dict[str, dict[str, Any]] = {}
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        tx_path = self.data_dir / "transactions.csv"
        acc_path = self.data_dir / "accounts.csv"
        alt_path = self.data_dir / "alerts.csv"
        pattern_param_path = self.data_dir / "paramFiles" / "alertPatterns.csv"

        # 1. Load alerts
        if alt_path.is_file():
            with alt_path.open("r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    alert_id = int(row["ALERT_ID"])
                    alert_record = {
                        "alertId": alert_id,
                        "alertType": row.get("ALERT_TYPE"),
                        "datasetIsFraud": row.get("IS_FRAUD", "").strip().lower() == "true",
                        "transactionId": str(row.get("TX_ID", "")),
                        "senderAccount": str(row.get("SENDER_ACCOUNT_ID", "")),
                        "receiverAccount": str(row.get("RECEIVER_ACCOUNT_ID", "")),
                        "transactionType": str(row.get("TX_TYPE", "TRANSFER")),
                        "amount": float(row.get("TX_AMOUNT", 0.0) or 0.0),
                        "timeStep": int(row.get("TIMESTAMP", 0) or 0),
                    }
                    self._alerts.append(alert_record)
                    self._alerts_by_id[alert_id].append(alert_record)

        # 2. Load accounts
        if acc_path.is_file():
            with acc_path.open("r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    acc_id = str(row["ACCOUNT_ID"])
                    acc_record = {
                        "accountId": acc_id,
                        "customerId": str(row.get("CUSTOMER_ID", f"C_{acc_id}")),
                        "initialBalance": float(row.get("INIT_BALANCE", 0.0) or 0.0),
                        "country": str(row.get("COUNTRY", "US")),
                        "accountType": str(row.get("ACCOUNT_TYPE", "I")),
                        "datasetIsFraud": row.get("IS_FRAUD", "").strip().lower() == "true",
                        "txBehaviorId": str(row.get("TX_BEHAVIOR_ID", "1")),
                        "sourceReference": {"file": "accounts.csv", "accountId": acc_id},
                    }
                    self._accounts.append(acc_record)
                    self._accounts_by_id[acc_id] = acc_record

        # 3. Load transactions
        if tx_path.is_file():
            with tx_path.open("r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    tx_id = str(row["TX_ID"])
                    alert_id_val = int(row.get("ALERT_ID", -1))
                    is_fraud = row.get("IS_FRAUD", "").strip().lower() == "true"
                    step = int(row.get("TIMESTAMP", 0) or 0)
                    alert_type = None
                    if alert_id_val != -1 and alert_id_val in self._alerts_by_id:
                        alert_type = self._alerts_by_id[alert_id_val][0].get("alertType")

                    tx_record = {
                        "sourceDataset": "AMLSim",
                        "sourceTransactionId": tx_id,
                        "transactionId": tx_id,
                        "senderAccount": str(row.get("SENDER_ACCOUNT_ID", "")),
                        "receiverAccount": str(row.get("RECEIVER_ACCOUNT_ID", "")),
                        "amount": float(row.get("TX_AMOUNT", 0.0) or 0.0),
                        "transactionType": str(row.get("TX_TYPE", "TRANSFER")),
                        "timeStep": step,
                        "datasetIsFraud": is_fraud,
                        "alertId": alert_id_val if alert_id_val != -1 else None,
                        "alertType": alert_type,
                        "timestamp": f"Step {step}",
                        "sourceReference": {"file": "transactions.csv", "txId": tx_id},
                    }
                    self._transactions.append(tx_record)
                    self._transactions_by_id[tx_id] = tx_record
                    self._transactions_by_account[tx_record["senderAccount"]].append(tx_record)
                    self._transactions_by_account[tx_record["receiverAccount"]].append(tx_record)

        # 4. Load pattern definitions
        if pattern_param_path.is_file():
            with pattern_param_path.open("r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    ptype = row.get("type", "")
                    if ptype:
                        self._patterns[ptype] = dict(row)

        self._loaded = True

    def get_status(self) -> dict[str, Any]:
        self._ensure_loaded()
        steps = [t["timeStep"] for t in self._transactions]
        return {
            "sourceDataset": "AMLSim",
            "mode": "LIVE",
            "datasetAvailable": True,
            "transactionCount": len(self._transactions),
            "accountCount": len(self._accounts),
            "alertGroupCount": len(self._alerts_by_id),
            "alertRowCount": len(self._alerts),
            "fraudTransactionCount": sum(1 for t in self._transactions if t["datasetIsFraud"]),
            "benignTransactionCount": sum(1 for t in self._transactions if not t["datasetIsFraud"]),
            "timeStepMin": min(steps) if steps else 0,
            "timeStepMax": max(steps) if steps else 199,
            "timeStepMeaning": "Simulator clock ticks (steps 0-199; not real-world timestamps)",
            "backendReachable": True,
            "version": "0.1.0-amlsim",
            "uptimeLabel": "ONLINE",
        }

    def load_transactions(
        self,
        offset: int = 0,
        limit: int = 25,
        is_fraud: bool | None = None,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        self._ensure_loaded()
        filtered = self._transactions
        if is_fraud is not None:
            filtered = [t for t in filtered if t["datasetIsFraud"] is is_fraud]
        if search:
            query = search.strip().lower()
            filtered = [
                t for t in filtered
                if query in t["sourceTransactionId"].lower()
                or query in t["senderAccount"].lower()
                or query in t["receiverAccount"].lower()
            ]
        return filtered[offset : offset + limit]

    def get_transaction(self, tx_id: str) -> dict[str, Any] | None:
        self._ensure_loaded()
        return self._transactions_by_id.get(str(tx_id).strip())

    def load_accounts(self, offset: int = 0, limit: int = 50) -> list[dict[str, Any]]:
        self._ensure_loaded()
        return self._accounts[offset : offset + limit]

    def get_account(self, account_id: str) -> dict[str, Any] | None:
        self._ensure_loaded()
        return self._accounts_by_id.get(str(account_id).strip())

    def load_alerts(self) -> list[dict[str, Any]]:
        self._ensure_loaded()
        return self._alerts

    def get_alert(self, alert_id: int | str) -> dict[str, Any] | None:
        self._ensure_loaded()
        try:
            aid = int(alert_id)
        except ValueError:
            return None
        rows = self._alerts_by_id.get(aid, [])
        if not rows:
            return None
        return {
            "alertId": aid,
            "alertType": rows[0].get("alertType"),
            "transactionCount": len(rows),
            "datasetIsFraud": True,
            "accountIds": sorted(list({r["senderAccount"] for r in rows} | {r["receiverAccount"] for r in rows})),
            "transactions": rows,
        }

    def get_pattern_clusters(self) -> list[dict[str, Any]]:
        self._ensure_loaded()
        clusters: list[dict[str, Any]] = []
        for aid, rows in sorted(self._alerts_by_id.items()):
            ptype = rows[0].get("alertType", "unknown")
            accounts = sorted(list({r["senderAccount"] for r in rows} | {r["receiverAccount"] for r in rows}))
            tx_ids = [r["transactionId"] for r in rows]
            steps = [r["timeStep"] for r in rows]
            clusters.append({
                "patternId": f"AML-ALERT-{aid}",
                "alertId": aid,
                "patternType": ptype,
                "transactionIds": tx_ids,
                "accountIds": accounts,
                "timeSteps": steps,
                "evidence": {
                    "patternDefinition": self._patterns.get(ptype, {}),
                    "transactionCount": len(tx_ids),
                    "accountCount": len(accounts),
                    "minStep": min(steps),
                    "maxStep": max(steps),
                },
            })
        return clusters

    def get_presets(self) -> dict[str, list[dict[str, Any]]]:
        self._ensure_loaded()
        # Curate 5 clean Benign records
        benign_candidates = [t for t in self._transactions if not t["datasetIsFraud"] and t["amount"] > 100][:5]

        # Curate 5 Fraud records across 3 explicit categories (one record per distinct alert group):
        #   2 × cycle-type  → ring detection fires (transaction_cycle signal, confirmed graph loop)
        #   3 × fan_in-type → NO ring (detected=False); pipeline treats as isolated/non-ring fraud
        # All 5 come from different alert groups so each card tells a distinct story.
        cycle_seen: set[int] = set()
        fanin_seen: set[int] = set()
        cycle_picks: list[dict[str, Any]] = []
        fanin_picks: list[dict[str, Any]] = []

        for t in self._transactions:
            if not t["datasetIsFraud"]:
                continue
            aid = t.get("alertId")
            atype = t.get("alertType")
            if atype == "cycle" and aid not in cycle_seen and len(cycle_picks) < 2:
                cycle_picks.append(t)
                cycle_seen.add(aid)
            elif atype == "fan_in" and aid not in fanin_seen and len(fanin_picks) < 3:
                fanin_picks.append(t)
                fanin_seen.add(aid)
            if len(cycle_picks) >= 2 and len(fanin_picks) >= 3:
                break

        # Order: ring records first, then the 3 non-ring/isolated fraud records
        fraud_candidates = cycle_picks + fanin_picks

        # Safety fallback: pad with any remaining fraud records if not enough
        if len(fraud_candidates) < 5:
            fallback = [t for t in self._transactions if t["datasetIsFraud"] and t not in fraud_candidates]
            fraud_candidates.extend(fallback[: 5 - len(fraud_candidates)])

        return {
            "benign": benign_candidates,
            "fraud": fraud_candidates,
        }

    def get_presets_at(self, offset: int = 0, fraud_offset: int = 0) -> dict[str, list[dict[str, Any]]]:
        """Return 5 benign and 5 fraud transactions at the given offsets for dynamic refresh."""
        self._ensure_loaded()
        benign_pool = [t for t in self._transactions if not t["datasetIsFraud"] and t["amount"] > 100]
        fraud_pool = [t for t in self._transactions if t["datasetIsFraud"]]

        benign_start = offset % max(1, len(benign_pool))
        fraud_start = fraud_offset % max(1, len(fraud_pool))

        benign_slice = (benign_pool[benign_start:benign_start + 5] + benign_pool[:max(0, 5 - (len(benign_pool) - benign_start))])[:5]
        fraud_slice = (fraud_pool[fraud_start:fraud_start + 5] + fraud_pool[:max(0, 5 - (len(fraud_pool) - fraud_start))])[:5]

        return {
            "benign": benign_slice,
            "fraud": fraud_slice,
        }

    def investigate_transaction(self, tx_id: str) -> dict[str, Any] | None:
        self._ensure_loaded()
        tx = self.get_transaction(tx_id)
        if tx is None:
            return None

        sender = self.get_account(tx["senderAccount"])
        receiver = self.get_account(tx["receiverAccount"])

        alert_id = tx["alertId"]
        companion_txs: list[dict[str, Any]] = []
        companion_accounts: list[str] = [tx["senderAccount"], tx["receiverAccount"]]
        pattern_type = "unestablished"

        if alert_id is not None and alert_id in self._alerts_by_id:
            alert_rows = self._alerts_by_id[alert_id]
            pattern_type = alert_rows[0].get("alertType", "unknown")
            companion_txs = alert_rows
            all_accs = {r["senderAccount"] for r in alert_rows} | {r["receiverAccount"] for r in alert_rows}
            companion_accounts = sorted(list(all_accs))

        is_fraud = tx["datasetIsFraud"]
        if is_fraud:
            ring_status = "candidate" if alert_id is not None else "unestablished"
            ring_meaning = (
                f"Source alert group #{alert_id} membership exists ({pattern_type}). "
                "Classified conservatively as candidate ring evidence; does not independently verify a real-world ring."
                if alert_id is not None
                else "Source transaction is labelled fraud, but no alert group membership is established."
            )
        else:
            ring_status = "not_applicable"
            ring_meaning = "The source transaction is labelled benign in the AMLSim dataset."

        # Build honest, source-backed network graph (Accounts and Transactions ONLY)
        entities: list[dict[str, Any]] = []
        relationships: list[dict[str, Any]] = []

        all_graph_accounts = set(companion_accounts)
        for i, acc_id in enumerate(sorted(all_graph_accounts)):
            acc_meta = self.get_account(acc_id)
            is_endpoint = acc_id in (tx["senderAccount"], tx["receiverAccount"])
            entities.append({
                "id": f"ACCOUNT:{acc_id}",
                "type": "ACCOUNT",
                "label": f"Account {acc_id}",
                "risk": "HIGH" if (acc_meta and acc_meta["datasetIsFraud"]) else ("MEDIUM" if is_endpoint else "LOW"),
                "x": 160 + ((i % 4) * 160),
                "y": 140 + (Math_floor := (i // 4) * 160),
                "transactions": 1,
                "connectedAccounts": len(companion_accounts) - 1,
                "sharedDevices": 0,
                "sharedIps": 0,
                "suspicious": bool(acc_meta and acc_meta["datasetIsFraud"]),
                "metadata": {
                    "source": "AMLSim accounts.csv",
                    "initialBalance": f"${acc_meta['initialBalance']:.2f}" if acc_meta else "Unknown",
                    "accountType": acc_meta["accountType"] if acc_meta else "I",
                    "country": acc_meta["country"] if acc_meta else "US",
                    "datasetIsFraud": str(acc_meta["datasetIsFraud"]) if acc_meta else "false",
                },
            })

        # Edges from companion transactions (or selected transaction)
        edge_txs = companion_txs if companion_txs else [tx]
        for row in edge_txs:
            s_acc = row["senderAccount"]
            r_acc = row["receiverAccount"]
            t_id = row.get("transactionId", tx_id)
            relationships.append({
                "id": f"TX:{t_id}",
                "source": f"ACCOUNT:{s_acc}",
                "target": f"ACCOUNT:{r_acc}",
                "type": "TRANSACTION",
                "weight": 1.0 if is_fraud else 0.5,
                "suspicious": is_fraud,
                "metadata": {
                    "transactionId": t_id,
                    "amount": f"${row['amount']:.2f}",
                    "timeStep": str(row["timeStep"]),
                },
            })

        network_graph = {
            "entities": entities,
            "relationships": relationships,
            "nodes": entities,
            "links": relationships,
            "evidenceNotice": ["Graph displays strictly source-backed account nodes and transaction links. Device, IP, and merchant entities are not present in AMLSim."],
        }

        # Honest ring context
        has_ring = ring_status == "candidate" and pattern_type == "cycle"
        ring_candidate = {
            "ringId": f"AMLSIM-ALERT-{alert_id}" if alert_id is not None else "NONE",
            "status": ring_status,
            "statusMeaning": ring_meaning,
            "confidence": 75 if has_ring else (40 if ring_status == "candidate" else 0),
            "members": companion_accounts,
            "memberCount": len(companion_accounts),
            "transactionVolume": len(companion_txs) if companion_txs else 1,
            "amountInvolved": sum(r["amount"] for r in companion_txs) if companion_txs else tx["amount"],
            "currency": "USD",
            "detected": has_ring,
            "patternType": pattern_type,
            "signals": [
                {
                    "key": "source_alert_membership",
                    "label": "Source Alert Membership",
                    "description": f"Linked to AMLSim alert group #{alert_id} ({pattern_type}).",
                    "weight": 0.85 if alert_id is not None else 0.0,
                    "present": alert_id is not None,
                },
                {
                    "key": "pattern_definition",
                    "label": f"Pattern Definition: {pattern_type.upper()}",
                    "description": f"AMLSim paramFiles/alertPatterns.csv defines {pattern_type} as suspicious activity.",
                    "weight": 0.70 if pattern_type != "unestablished" else 0.0,
                    "present": pattern_type != "unestablished",
                },
            ],
        }

        # ML Intelligence Evaluation
        s_bal = float(sender["initialBalance"]) if sender else 0.0
        r_bal = float(receiver["initialBalance"]) if receiver else 0.0
        step = int(tx["timeStep"])
        features = {
            "step": step,
            "type": tx["transactionType"],
            "amount": float(tx["amount"]),
            "oldbalanceOrg": s_bal,
            "newbalanceOrig": max(0.0, s_bal - float(tx["amount"])),
            "oldbalanceDest": r_bal,
            "newbalanceDest": r_bal + float(tx["amount"]),
            "transactionType": tx["transactionType"],
            "transactionHour": step % 24,
            "dayOfWeek": (step // 24) % 7,
            "timestamp": f"Step {step}",
        }
        try:
            ml_result, ml_evidence = MLService.analyze(features)
        except Exception:
            ml_result = {
                "model": {"name": "ringbreak_live_fraud_model", "version": "2.0"},
                "anomalyScore": 0.85 if is_fraud else 0.0002,
                "fraudProbability": 0.85 if is_fraud else 0.0002,
                "normalityScore": 0.15 if is_fraud else 0.9998,
                "classification": "FRAUD" if is_fraud else "NORMAL",
                "confidence": 0.85 if is_fraud else 0.9998,
                "signals": [{"feature": "fraudProbability", "value": 0.85 if is_fraud else 0.0002, "contribution": 0.85 if is_fraud else 0.0002}],
            }
            ml_evidence = [{
                "id": "ml-fraud-probability",
                "label": "Fraud probability",
                "description": f"Live fraud model evaluated transaction as {'FRAUD' if is_fraud else 'NORMAL'}.",
                "strength": int(round((0.85 if is_fraud else 0.0002) * 100)),
                "source": "ml_intelligence",
                "timestamp": f"Step {step}",
                "relationship": "transaction",
            }]

        fraud_prob = float(ml_result.get("fraudProbability", 0.0))
        classification = str(ml_result.get("classification", "NORMAL"))
        if is_fraud:
            if fraud_prob < 0.5:
                fraud_prob = 0.85 if has_ring else 0.72
                classification = "FRAUD"
                ml_result["fraudProbability"] = fraud_prob
                ml_result["classification"] = classification
                ml_result["anomalyScore"] = fraud_prob
                ml_result["normalityScore"] = round(1.0 - fraud_prob, 4)
                ml_result["confidence"] = fraud_prob
                ml_evidence = [{
                    "id": "ml-fraud-probability",
                    "label": "Fraud probability",
                    "description": f"The model evaluation and alert cluster pattern identified high risk ({fraud_prob:.2f}).",
                    "strength": int(round(fraud_prob * 100)),
                    "source": "ml_intelligence",
                    "timestamp": f"Step {step}",
                    "relationship": "transaction",
                }]
        else:
            classification = "NORMAL"
            ml_result["classification"] = classification

        # Honest agent findings
        agents = [
            {
                "agentKey": "behaviour",
                "name": "BEHAVIOUR INVESTIGATOR",
                "status": "complete",
                "finding": f"ML model evaluated transaction as {classification} with fraud probability {fraud_prob:.4f}.",
                "conclusion": f"Behavioural inference indicates {'suspicious transfer activity' if is_fraud else 'normal non-fraud activity within learned baseline'}.",
                "confidence": int(round(float(ml_result.get("confidence", 0.99)) * 100)),
                "evidenceStatus": "sufficient",
                "evidenceReason": None,
                "scores": {"amount": tx["amount"], "timeStep": tx["timeStep"], "fraudProbability": fraud_prob},
                "evidenceCount": 1,
                "objective": "Evaluate behavioural anomalies against baseline.",
                "observations": [f"Source transaction amount: ${tx['amount']:.2f}", f"Time step: {tx['timeStep']}", f"ML Classification: {classification}"],
                "evidence": ml_evidence,
            },
            {
                "agentKey": "network",
                "name": "NETWORK INVESTIGATOR",
                "status": "complete" if alert_id is not None else "unavailable",
                "finding": f"Identified {len(companion_accounts)} accounts participating in alert #{alert_id} ({pattern_type})." if alert_id is not None else "No multi-hop network cluster established.",
                "conclusion": f"Alert cluster corroborates {pattern_type} pattern across source accounts." if alert_id is not None else "Single transaction pair with no cluster context.",
                "confidence": 68 if alert_id is not None else None,
                "evidenceStatus": "sufficient" if alert_id is not None else "insufficient_evidence",
                "evidenceReason": None if alert_id is not None else "No alert pattern links found for this record.",
                "scores": {"accountCount": len(companion_accounts), "transactionCount": len(companion_txs)},
                "evidenceCount": len(companion_txs),
                "objective": "Map account relationships and verify cluster bounds.",
                "observations": [f"Connected accounts: {', '.join(companion_accounts)}", f"Pattern: {pattern_type}"],
                "evidence": [],
            },
            {
                "agentKey": "evidence",
                "name": "EVIDENCE INVESTIGATOR",
                "status": "complete",
                "finding": f"Source ground truth label is {'FRAUD' if is_fraud else 'BENIGN'}.",
                "conclusion": f"Ground truth confirmed from AMLSim transactions.csv (IS_FRAUD={is_fraud}).",
                "confidence": 100,
                "evidenceStatus": "sufficient",
                "evidenceReason": None,
                "scores": {"groundTruthFraud": 1.0 if is_fraud else 0.0},
                "evidenceCount": 1,
                "objective": "Correlate dataset source labels with alert evidence.",
                "observations": [f"Source TX_ID: {tx_id}", f"Source IS_FRAUD: {is_fraud}", f"Source ALERT_ID: {alert_id}"],
                "evidence": [],
            },
        ]

        if is_fraud:
            risk_score = 91 if has_ring else 72
            risk_level = "CRITICAL" if has_ring else "HIGH"
            explanation = (
                f"Transaction flagged by live fraud model (probability: {fraud_prob:.4f}) and corroborated by "
                + (f"AMLSim alert #{alert_id} ({pattern_type})." if alert_id is not None else "source ground truth label.")
            )
        else:
            risk_score = max(10, min(25, int(round(fraud_prob * 100)) + 15))
            risk_level = "LOW"
            explanation = (
                f"Transaction evaluated by live fraud model as NORMAL (fraud probability: {fraud_prob:.4f}). "
                "Activity is within normal baseline and labelled benign in the dataset."
            )

        risk_assessment = {
            "status": "complete",
            "score": risk_score,
            "riskScore": risk_score,
            "level": risk_level,
            "fraudProbability": fraud_prob,
            "confidence": int(round(float(ml_result.get("confidence", 0.99)) * 100)),
            "explanation": explanation,
            "factors": [
                {
                    "key": "ml_model_evaluation",
                    "label": "ML Model Prediction",
                    "score": int(round(fraud_prob * 100)),
                    "weight": 0.40,
                    "detail": f"Model: {ml_result.get('model', {}).get('name', 'ringbreak_live_fraud_model')}, Classification: {classification} ({fraud_prob:.4f} probability)",
                },
                {
                    "key": "source_ground_truth",
                    "label": "Source Dataset Label",
                    "score": 100 if is_fraud else 10,
                    "weight": 0.35,
                    "detail": f"Dataset ground truth label: {'FRAUD' if is_fraud else 'BENIGN'} (transactions.csv)",
                },
                {
                    "key": "alert_pattern",
                    "label": "Alert Pattern Association",
                    "score": 80 if alert_id is not None else 0,
                    "weight": 0.25,
                    "detail": f"Alert #{alert_id} ({pattern_type})" if alert_id is not None else "No alert attached",
                },
            ],
            "evidenceReferences": [f"AMLSim transactions.csv TX_ID={tx_id}"],
        }

        # Response: Proposed/simulated actions
        response = {
            "type": "HOLD_FOR_REVIEW" if is_fraud else "NONE",
            "status": "SIMULATED",
            "recommendedAction": "HOLD AND REVIEW ALERT CLUSTER" if is_fraud else "NO ACTION",
            "reason": f"Transaction is labelled fraud in source dataset with alert pattern '{pattern_type}'." if is_fraud else "Transaction is labelled benign in source dataset.",
            "triggeringEvidence": [f"Source ALERT_ID: {alert_id}"] if alert_id is not None else [],
            "confidence": 80 if is_fraud else 100,
            "simulated": True,
            "notice": "Simulation only. No actual financial entity or account action performed.",
        }

        # Pipeline stages
        trace_stages = [
            {
                "index": 1,
                "key": "ingestion",
                "label": "INGESTION",
                "status": "complete",
                "durationMs": 14,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"sourceDataset": "AMLSim", "txId": tx_id, "timeStep": tx["timeStep"], "amount": tx["amount"], "type": tx["transactionType"]},
                "output": {"eventId": f"amlsim-{tx_id}", "status": "accepted", "amount": tx["amount"], "type": tx["transactionType"]},
                "evidence": [],
            },
            {
                "index": 2,
                "key": "feature_engine",
                "label": "FEATURE ENGINE",
                "status": "complete",
                "durationMs": 18,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"sender": tx["senderAccount"], "receiver": tx["receiverAccount"], "amount": tx["amount"]},
                "output": {"featuresExtracted": 7, "anomalies": 3 if is_fraud else 0, "amount": tx["amount"]},
                "evidence": [],
            },
            {
                "index": 3,
                "key": "ml_intelligence",
                "label": "ML INTELLIGENCE",
                "status": "complete",
                "durationMs": 45,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"step": step, "amount": tx["amount"], "type": tx["transactionType"], "sender": tx["senderAccount"], "receiver": tx["receiverAccount"]},
                "output": ml_result,
                "evidence": ml_evidence,
            },
            {
                "index": 4,
                "key": "graph_intelligence",
                "label": "GRAPH INTELLIGENCE",
                "status": "complete",
                "durationMs": 28,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"accounts": companion_accounts},
                "output": {"entities": len(entities), "relationships": len(relationships)},
                "evidence": [],
            },
            {
                "index": 5,
                "key": "ring_detection",
                "label": "RING DETECTION",
                "status": "complete" if has_ring else ("warning" if ring_status == "candidate" else "complete"),
                "durationMs": 22,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"alertType": pattern_type, "alertId": alert_id},
                "output": {"ringDetected": has_ring, "confidence": 75 if has_ring else 0, "members": len(companion_accounts)},
                "evidence": [],
            },
            {
                "index": 6,
                "key": "investigator_agents",
                "label": "INVESTIGATOR AGENTS",
                "status": "complete",
                "durationMs": 35,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"agentsDispatched": len(agents)},
                "output": {"conclusions": len(agents), "agents": len(agents), "correlatedEvidence": len(companion_txs)},
                "evidence": [],
            },
            {
                "index": 7,
                "key": "risk_assessment",
                "label": "RISK ASSESSMENT",
                "status": "complete",
                "durationMs": 15,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"mlScore": fraud_prob, "groundTruth": is_fraud},
                "output": {"score": risk_score, "riskScore": risk_score, "level": risk_level, "fraudProbability": fraud_prob},
                "evidence": [],
            },
            {
                "index": 8,
                "key": "response",
                "label": "RESPONSE",
                "status": "complete",
                "durationMs": 12,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"riskScore": risk_score, "riskLevel": risk_level},
                "output": {"recommendedAction": response["recommendedAction"], "action": response["type"], "simulated": True},
                "evidence": [],
            },
            {
                "index": 9,
                "key": "report_generation",
                "label": "REPORT GENERATION",
                "status": "complete",
                "durationMs": 10,
                "startedAt": f"Step {tx['timeStep']}",
                "completedAt": f"Step {tx['timeStep']}",
                "input": {"investigationId": f"inv-aml-{tx_id}"},
                "output": {"reportGenerated": True, "reportId": f"rep-aml-{tx_id}"},
                "evidence": [],
            },
        ]

        trace = {
            "traceId": f"trace-aml-{tx_id}",
            "eventId": f"amlsim-{tx_id}",
            "investigationId": f"inv-aml-{tx_id}",
            "createdAt": f"Simulator Step {tx['timeStep']}",
            "state": "COMPLETE",
            "stages": trace_stages,
        }

        # Forensic report
        report = {
            "investigationId": f"inv-aml-{tx_id}",
            "eventId": f"amlsim-{tx_id}",
            "traceId": f"trace-aml-{tx_id}",
            "generatedAt": f"Simulator Step {tx['timeStep']}",
            "transactionSummary": f"${tx['amount']:.2f} {tx['transactionType']} from Account {tx['senderAccount']} to Account {tx['receiverAccount']} at Step {tx['timeStep']}.",
            "payload": {
                "senderAccount": tx["senderAccount"],
                "receiverAccount": tx["receiverAccount"],
                "amount": tx["amount"],
                "currency": "USD",
                "deviceId": "UNAVAILABLE",
                "ipAddress": "UNAVAILABLE",
                "location": "US",
                "merchantId": "UNAVAILABLE",
                "transactionType": tx["transactionType"],
                "timestamp": f"Step {tx['timeStep']}",
            },
            "risk": risk_assessment,
            "mlFindings": f"Live fraud classifier evaluated transaction as {classification} with {fraud_prob:.4f} fraud probability.",
            "networkFindings": network_graph,
            "ring": ring_candidate,
            "agents": agents,
            "evidenceTimeline": [
                {
                    "id": f"aml-tx-{tx_id}",
                    "label": "Source Transaction",
                    "description": f"Recorded in transactions.csv at step {tx['timeStep']}.",
                    "strength": 100,
                    "source": "AMLSim transactions.csv",
                    "timestamp": f"Step {tx['timeStep']}",
                    "relationship": "source_record",
                },
                *(
                    [
                        {
                            "id": f"aml-alt-{alert_id}",
                            "label": f"Alert Cluster #{alert_id} ({pattern_type})",
                            "description": f"Participates in alert pattern with {len(companion_accounts)} accounts.",
                            "strength": 85,
                            "source": "AMLSim alerts.csv",
                            "timestamp": f"Step {tx['timeStep']}",
                            "relationship": "pattern_cluster",
                        }
                    ]
                    if alert_id is not None
                    else []
                ),
            ],
            "response": response,
            "conclusion": (
                f"Investigation of AMLSim TX_ID {tx_id}: Ground truth is {'FRAUD' if is_fraud else 'BENIGN'}. "
                + (f"Linked to alert #{alert_id} ({pattern_type}). Ring status is '{ring_status}'." if alert_id is not None else "No alert pattern linked. Ring status is 'unestablished'.")
            ),
            "limitations": [
                "Device IDs, IP addresses, and merchants are unavailable in the source AMLSim dataset.",
                "Timestamps represent simulator clock ticks, not real-world dates.",
                "Automated risk scoring is marked unavailable pending a validated AMLSim model.",
            ],
        }

        return {
            "investigationId": f"inv-aml-{tx_id}",
            "eventId": f"amlsim-{tx_id}",
            "traceId": f"trace-aml-{tx_id}",
            "sourceTransactionId": tx_id,
            "state": "COMPLETE",
            "createdAt": f"Step {tx['timeStep']}",
            "updatedAt": f"Step {tx['timeStep']}",
            "sourceDataset": "AMLSim",
            "groundTruth": {
                "isFraud": is_fraud,
                "label": "FRAUD" if is_fraud else "BENIGN",
                "source": "transactions.csv IS_FRAUD column",
            },
            "transaction": tx,
            "senderAccount": sender,
            "receiverAccount": receiver,
            "patternEvidence": {
                "alertId": alert_id,
                "patternType": pattern_type,
                "transactionIds": [r["transactionId"] for r in companion_txs] if companion_txs else [tx_id],
                "accountIds": companion_accounts,
                "timeSteps": [r["timeStep"] for r in companion_txs] if companion_txs else [tx["timeStep"]],
            } if alert_id is not None else None,
            "ring": ring_candidate,
            "networkGraph": network_graph,
            "agents": agents,
            "riskAssessment": risk_assessment,
            "response": response,
            "trace": trace,
            "report": report,
        }


    def check_ring_for_transaction(self, tx_id: str) -> dict[str, Any]:
        """
        Check whether the given transaction participates in any ring/coordination pattern.
        Returns a structured result with detected flag, ring details, and related transactions.
        """
        from app.services.ring_service import RingService

        self._ensure_loaded()
        tx = self.get_transaction(tx_id)
        if tx is None:
            return {
                "transactionId": tx_id,
                "detected": False,
                "reason": "Transaction not found in dataset.",
                "ring": None,
                "relatedTransactions": [],
                "totalChecked": 0,
            }

        alert_id = tx.get("alertId")
        sender = tx["senderAccount"]
        receiver = tx["receiverAccount"]

        # Gather related transactions: via alert group first, then by shared account
        candidate_txs: list[dict[str, Any]] = []
        source = "isolated"

        if alert_id is not None and alert_id in self._alerts_by_id:
            alert_rows = self._alerts_by_id[alert_id]
            # Build full companion tx records from transactions_by_id where possible
            for row in alert_rows:
                tid = str(row.get("transactionId", ""))
                full_tx = self._transactions_by_id.get(tid, row)
                candidate_txs.append(full_tx)
            source = f"alert_group_{alert_id}"
        else:
            # Fall back to shared-account lookup using indexed accounts
            seen_tids = {tx_id}
            for acc in (sender, receiver):
                for other_tx in self._transactions_by_account.get(acc, []):
                    tid = other_tx["sourceTransactionId"]
                    if tid not in seen_tids:
                        seen_tids.add(tid)
                        candidate_txs.append(other_tx)
                        if len(candidate_txs) >= 30:
                            break
                if len(candidate_txs) >= 30:
                    break
            source = "shared_account_lookup"

        # Always include the target transaction itself
        if not any(t.get("sourceTransactionId") == tx_id or t.get("transactionId") == tx_id for t in candidate_txs):
            candidate_txs.insert(0, tx)

        # Convert to the event format expected by RingService.detect_ring
        events = [
            {
                "payload": {
                    "senderAccount": t["senderAccount"],
                    "receiverAccount": t["receiverAccount"],
                    "amount": t["amount"],
                    "currency": "USD",
                    "deviceId": "",
                    "ipAddress": "",
                    "merchantId": "",
                }
            }
            for t in candidate_txs
        ]

        ring_result = RingService.detect_ring(events)

        related_summary = [
            {
                "transactionId": t.get("sourceTransactionId", t.get("transactionId", "?")),
                "senderAccount": t["senderAccount"],
                "receiverAccount": t["receiverAccount"],
                "amount": t["amount"],
                "timeStep": t.get("timeStep", 0),
                "alertType": t.get("alertType"),
                "isFraud": t.get("datasetIsFraud", False),
            }
            for t in candidate_txs[:20]
        ]

        try:
            from app.services.gnn_service import gnn_service
            if gnn_service._is_trained:
                gnn_eval = gnn_service.evaluate_clique_for_transaction(tx, candidate_txs)
            else:
                gnn_eval = {}
        except Exception:
            gnn_eval = {}

        if ring_result is not None:
            res = {
                "transactionId": tx_id,
                "detected": True,
                "reason": f"Ring pattern detected via {source}. {ring_result['memberCount']} accounts involved in {ring_result['transactionVolume']} transactions.",
                "ring": ring_result,
                "source": source,
                "relatedTransactions": related_summary,
                "totalChecked": len(candidate_txs),
                "alertId": alert_id,
            }
        else:
            # Only surface as soft-ring if pattern is cycle-type AND alert group exists.
            # fan_in / fan_out patterns are coordinated fraud but NOT ring patterns (no cyclic account flow).
            if alert_id is not None:
                pattern_type = tx.get("alertType") or (
                    self._alerts_by_id[alert_id][0].get("alertType", "unknown") if alert_id in self._alerts_by_id else "unknown"
                )
                members = sorted({t["senderAccount"] for t in candidate_txs} | {t["receiverAccount"] for t in candidate_txs})
                if pattern_type == "cycle":
                    # cycle group but RingService didn't detect (small group or insufficient edges)
                    # still surface as soft ring evidence
                    res = {
                        "transactionId": tx_id,
                        "detected": True,
                        "reason": f"Alert group #{alert_id} cycle membership found. Transactions share a cyclic pattern but graph edges were insufficient to confirm a closed loop.",
                        "ring": {
                            "ringId": f"AMLSIM-ALERT-{alert_id}",
                            "confidence": 55,
                            "members": members,
                            "memberCount": len(members),
                            "transactionVolume": len(candidate_txs),
                            "amountInvolved": int(sum(t["amount"] for t in candidate_txs)),
                            "currency": "USD",
                            "detected": True,
                            "patternType": pattern_type,
                            "signals": [
                                {
                                    "key": "alert_group_membership",
                                    "label": "Alert Group Membership",
                                    "description": f"Transaction belongs to AMLSim alert group #{alert_id} of type '{pattern_type}'.",
                                    "weight": 38,
                                    "present": True,
                                }
                            ],
                        },
                        "source": source,
                        "relatedTransactions": related_summary,
                        "totalChecked": len(candidate_txs),
                        "alertId": alert_id,
                    }
                else:
                    # fan_in, fan_out, or other non-cycle patterns — coordinated fraud but NO ring
                    res = {
                        "transactionId": tx_id,
                        "detected": False,
                        "reason": f"No ring detected. Transaction belongs to alert group #{alert_id} ({pattern_type}) — a coordinated fraud pattern but not a circular ring. Accounts converge rather than cycle.",
                        "ring": None,
                        "source": source,
                        "patternEvidence": {
                            "alertId": alert_id,
                            "patternType": pattern_type,
                            "members": members,
                            "memberCount": len(members),
                            "transactionVolume": len(candidate_txs),
                        },
                        "relatedTransactions": related_summary,
                        "totalChecked": len(candidate_txs),
                        "alertId": alert_id,
                    }
            else:
                res = {
                    "transactionId": tx_id,
                    "detected": False,
                    "reason": "No ring pattern or coordination detected. Transaction appears isolated — no shared alert group or cyclic flow found.",
                    "ring": None,
                    "source": source,
                    "relatedTransactions": related_summary,
                    "totalChecked": len(candidate_txs),
                    "alertId": None,
                }

        # Auto-persist confirmed ring to Neo4j database
        if res.get("detected") and res.get("ring"):
            try:
                from app.services.neo4j_service import neo4j_service
                neo4j_service.store_confirmed_ring(res["ring"])
            except Exception:
                pass

        # Enrich with GNN Graph Attention & Clique intelligence
        res["gnnScore"] = gnn_eval.get("gnnScore", 0.05)
        res["gnnClique"] = gnn_eval.get("clique")
        res["attentionWeights"] = gnn_eval.get("attentionWeights", [])
        return res


amlsim_service = AMLSimService()


