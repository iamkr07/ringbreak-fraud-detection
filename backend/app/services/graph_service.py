from __future__ import annotations

from collections import defaultdict
from typing import Any


class GraphService:
    @staticmethod
    def _make_entity(entity_id: str, entity_type: str, label: str, metadata: dict[str, str] | None = None) -> dict[str, Any]:
        return {
            "id": entity_id,
            "type": entity_type,
            "label": label,
            "risk": "LOW",
            "x": 0,
            "y": 0,
            "transactions": 0,
            "connectedAccounts": 0,
            "sharedDevices": 0,
            "sharedIps": 0,
            "suspicious": False,
            "metadata": metadata or {},
        }

    @staticmethod
    def _entity_key(entity_type: str, value: str) -> str:
        return f"{entity_type}:{value}"

    @staticmethod
    def _relationship_key(source: str, target: str, rel_type: str) -> tuple[str, str, str]:
        return tuple(sorted((source, target))) + (rel_type,)

    @staticmethod
    def _add_relationship(relationships: dict[tuple[str, str, str], dict[str, Any]], source: str, target: str, rel_type: str, weight: int = 1, suspicious: bool = False) -> None:
        key = GraphService._relationship_key(source, target, rel_type)
        if key in relationships:
            relationships[key]["weight"] += weight
            relationships[key]["suspicious"] = relationships[key]["suspicious"] or suspicious
            return

        relationships[key] = {
            "id": f"{rel_type}:{source}:{target}",
            "source": source,
            "target": target,
            "type": rel_type,
            "weight": weight,
            "suspicious": suspicious,
        }

    @staticmethod
    def _normalize_payload(event: dict[str, Any] | Any) -> dict[str, Any]:
        if isinstance(event, dict):
            payload = event.get("payload")
            if isinstance(payload, dict):
                return payload
            return event
        return {}

    @staticmethod
    def build_network_graph_from_events(events: list[dict[str, Any]]) -> dict[str, Any]:
        entities: dict[str, dict[str, Any]] = {}
        relationships: dict[tuple[str, str, str], dict[str, Any]] = {}
        tx_counts: dict[str, int] = defaultdict(int)
        device_accounts: dict[str, set[str]] = defaultdict(set)
        ip_accounts: dict[str, set[str]] = defaultdict(set)
        merchant_accounts: dict[str, set[str]] = defaultdict(set)

        for event in events:
            payload = GraphService._normalize_payload(event)
            if not payload:
                continue

            sender = str(payload.get("senderAccount", "")).strip()
            receiver = str(payload.get("receiverAccount", "")).strip()
            device = str(payload.get("deviceId", "")).strip()
            ip_address = str(payload.get("ipAddress", "")).strip()
            merchant_id = str(payload.get("merchantId", "")).strip()

            if not sender or not receiver:
                continue

            account_sender_id = GraphService._entity_key("ACCOUNT", sender)
            account_receiver_id = GraphService._entity_key("ACCOUNT", receiver)
            device_id = GraphService._entity_key("DEVICE", device)
            ip_id = GraphService._entity_key("IP", ip_address)
            merchant_id_key = GraphService._entity_key("MERCHANT", merchant_id)

            for account_id, account_label in [(account_sender_id, sender), (account_receiver_id, receiver)]:
                if account_id not in entities:
                    entities[account_id] = GraphService._make_entity(account_id, "ACCOUNT", account_label)
                tx_counts[account_id] += 1

            if device:
                if device_id not in entities:
                    entities[device_id] = GraphService._make_entity(device_id, "DEVICE", device, {"kind": "device"})
                tx_counts[device_id] += 1
                device_accounts[device].update({account_sender_id, account_receiver_id})
                GraphService._add_relationship(relationships, account_sender_id, device_id, "SHARED_DEVICE", weight=1, suspicious=False)
                GraphService._add_relationship(relationships, account_receiver_id, device_id, "SHARED_DEVICE", weight=1, suspicious=False)

            if ip_address:
                if ip_id not in entities:
                    entities[ip_id] = GraphService._make_entity(ip_id, "IP", ip_address, {"kind": "ip"})
                tx_counts[ip_id] += 1
                ip_accounts[ip_address].update({account_sender_id, account_receiver_id})
                GraphService._add_relationship(relationships, account_sender_id, ip_id, "SHARED_IP", weight=1, suspicious=False)
                GraphService._add_relationship(relationships, account_receiver_id, ip_id, "SHARED_IP", weight=1, suspicious=False)

            if merchant_id:
                if merchant_id_key not in entities:
                    entities[merchant_id_key] = GraphService._make_entity(merchant_id_key, "MERCHANT", merchant_id, {"kind": "merchant"})
                tx_counts[merchant_id_key] += 1
                merchant_accounts[merchant_id].update({account_sender_id, account_receiver_id})
                GraphService._add_relationship(relationships, account_sender_id, merchant_id_key, "SHARED_MERCHANT", weight=1, suspicious=False)
                GraphService._add_relationship(relationships, account_receiver_id, merchant_id_key, "SHARED_MERCHANT", weight=1, suspicious=False)

            GraphService._add_relationship(relationships, account_sender_id, account_receiver_id, "TRANSACTION", weight=1, suspicious=False)

        for device, accounts in sorted(device_accounts.items()):
            account_list = sorted(accounts)
            for index, source in enumerate(account_list):
                for target in account_list[index + 1 :]:
                    GraphService._add_relationship(relationships, source, target, "SHARED_DEVICE", weight=1, suspicious=False)

        for ip_value, accounts in sorted(ip_accounts.items()):
            account_list = sorted(accounts)
            for index, source in enumerate(account_list):
                for target in account_list[index + 1 :]:
                    GraphService._add_relationship(relationships, source, target, "SHARED_IP", weight=1, suspicious=False)

        for merchant, accounts in sorted(merchant_accounts.items()):
            account_list = sorted(accounts)
            for index, source in enumerate(account_list):
                for target in account_list[index + 1 :]:
                    GraphService._add_relationship(relationships, source, target, "SHARED_MERCHANT", weight=1, suspicious=False)

        for entity in entities.values():
            entity_id = entity["id"]
            related = [rel for rel in relationships.values() if entity_id in {rel["source"], rel["target"]}]
            neighbor_accounts = {
                rel["source"] if rel["source"] != entity_id else rel["target"]
                for rel in related
                if rel["type"] in {"TRANSACTION", "SHARED_DEVICE", "SHARED_IP", "SHARED_MERCHANT"}
            }
            entity["degree"] = len(related)
            entity["connectedAccounts"] = len([neighbor for neighbor in neighbor_accounts if neighbor.startswith("ACCOUNT:")])
            entity["transactions"] = tx_counts.get(entity_id, 0)
            entity["sharedDevices"] = len({
                rel["source"] if rel["source"] != entity_id else rel["target"]
                for rel in related
                if rel["type"] == "SHARED_DEVICE"
                and (rel["source"] if rel["source"] != entity_id else rel["target"]).startswith("DEVICE:")
            })
            entity["sharedIps"] = len({
                rel["source"] if rel["source"] != entity_id else rel["target"]
                for rel in related
                if rel["type"] == "SHARED_IP"
                and (rel["source"] if rel["source"] != entity_id else rel["target"]).startswith("IP:")
            })
            entity["suspicious"] = entity["sharedDevices"] > 0 or entity["sharedIps"] > 0 or entity["transactions"] > 2
            entity["risk"] = "HIGH" if entity["suspicious"] else "LOW"

        entity_list = sorted(entities.values(), key=lambda item: (item["type"], item["label"]))
        relationship_list = sorted(relationships.values(), key=lambda item: (item["type"], item["source"], item["target"]))

        for index, entity in enumerate(entity_list):
            entity["x"] = 120 + (index % 6) * 120
            entity["y"] = 120 + (index // 6) * 120

        return {"entities": entity_list, "relationships": relationship_list}

    @staticmethod
    def build_graph_evidence(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        evidence: list[dict[str, Any]] = []
        by_pair: dict[tuple[str, str], str] = {}

        for event in events:
            payload = event.get("payload") if isinstance(event, dict) else event
            if not isinstance(payload, dict):
                continue
            sender = str(payload.get("senderAccount", "")).strip()
            receiver = str(payload.get("receiverAccount", "")).strip()
            device = str(payload.get("deviceId", "")).strip()
            ip_address = str(payload.get("ipAddress", "")).strip()
            merchant = str(payload.get("merchantId", "")).strip()
            if not sender or not receiver:
                continue
            pair = tuple(sorted((sender, receiver)))
            by_pair[pair] = payload.get("timestamp", "1970-01-01T00:00:00Z")

            if sender and receiver:
                evidence.append({
                    "id": f"graph-transaction-{sender}-{receiver}",
                    "label": "Direct transaction",
                    "description": f"{sender} and {receiver} transacted directly.",
                    "strength": 75,
                    "source": "graph_intelligence",
                    "timestamp": payload.get("timestamp", "1970-01-01T00:00:00Z"),
                    "relationship": "transaction",
                })

            if device:
                evidence.append({
                    "id": f"graph-device-{device}-{sender}",
                    "label": "Shared device",
                    "description": f"{sender} and {receiver} share device {device}.",
                    "strength": 60,
                    "source": "graph_intelligence",
                    "timestamp": payload.get("timestamp", "1970-01-01T00:00:00Z"),
                    "relationship": "shared_device",
                })

            if ip_address:
                evidence.append({
                    "id": f"graph-ip-{ip_address}-{sender}",
                    "label": "Shared IP",
                    "description": f"{sender} and {receiver} share IP {ip_address}.",
                    "strength": 60,
                    "source": "graph_intelligence",
                    "timestamp": payload.get("timestamp", "1970-01-01T00:00:00Z"),
                    "relationship": "shared_ip",
                })

            if merchant:
                evidence.append({
                    "id": f"graph-merchant-{merchant}-{sender}",
                    "label": "Shared merchant",
                    "description": f"Merchant {merchant} is associated with multiple accounts in the transaction history.",
                    "strength": 55,
                    "source": "graph_intelligence",
                    "timestamp": payload.get("timestamp", "1970-01-01T00:00:00Z"),
                    "relationship": "shared_merchant",
                })

        for (left, right), timestamp in sorted(by_pair.items()):
            evidence.append({
                "id": f"graph-account-pair-{left}-{right}",
                "label": "Repeated account connection",
                "description": f"{left} and {right} have a recurring transaction relationship across the persisted graph.",
                "strength": 50,
                "source": "graph_intelligence",
                "timestamp": timestamp,
                "relationship": "transaction",
            })

        deduped: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in evidence:
            key = item["id"]
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped
