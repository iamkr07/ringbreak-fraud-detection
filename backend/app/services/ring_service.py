from __future__ import annotations

from collections import defaultdict
from hashlib import sha256
from typing import Any


class RingService:
    @staticmethod
    def _normalize_payload(event: dict[str, Any] | Any) -> dict[str, Any]:
        if isinstance(event, dict):
            payload = event.get("payload")
            if isinstance(payload, dict):
                return payload
            return event
        return {}

    @staticmethod
    def _transaction_accounts(events: list[dict[str, Any]]) -> set[str]:
        accounts: set[str] = set()
        for event in events:
            payload = RingService._normalize_payload(event)
            if not isinstance(payload, dict):
                continue
            sender = str(payload.get("senderAccount", "")).strip()
            receiver = str(payload.get("receiverAccount", "")).strip()
            if sender:
                accounts.add(sender)
            if receiver:
                accounts.add(receiver)
        return accounts

    @staticmethod
    def _find_cycle_members(graph: dict[str, set[str]]) -> set[str]:
        cycle_members: set[str] = set()

        def dfs(start: str, current: str, visited: set[str], path: list[str]) -> None:
            for neighbor in sorted(graph.get(current, set())):
                if neighbor == start and len(path) >= 2:
                    cycle_members.update(path)
                    return
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                dfs(start, neighbor, visited, path + [neighbor])
                visited.remove(neighbor)

        for node in sorted(graph):
            if graph.get(node):
                dfs(node, node, {node}, [node])
            if len(cycle_members) >= 3:
                break
        return cycle_members

    @staticmethod
    def detect_ring(events: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not events:
            return None

        graph: dict[str, set[str]] = defaultdict(set)
        shared_devices: dict[str, set[str]] = defaultdict(set)
        shared_ips: dict[str, set[str]] = defaultdict(set)
        shared_merchants: dict[str, set[str]] = defaultdict(set)
        amount_total = 0.0
        transaction_volume = 0
        currency = "USD"

        for event in events:
            payload = RingService._normalize_payload(event)
            if not isinstance(payload, dict):
                continue
            sender = str(payload.get("senderAccount", "")).strip()
            receiver = str(payload.get("receiverAccount", "")).strip()
            if not sender or not receiver:
                continue

            graph[sender].add(receiver)
            transaction_volume += 1
            amount_total += float(payload.get("amount") or 0.0)
            if payload.get("currency"):
                currency = str(payload.get("currency"))

            device = str(payload.get("deviceId", "")).strip()
            ip = str(payload.get("ipAddress", "")).strip()
            merchant = str(payload.get("merchantId", "")).strip()

            if device:
                shared_devices[device].update({sender, receiver})
            if ip:
                shared_ips[ip].update({sender, receiver})
            if merchant:
                shared_merchants[merchant].update({sender, receiver})

        cycle_members = RingService._find_cycle_members(graph)
        signal_candidates: list[dict[str, Any]] = []

        if len(cycle_members) >= 3:
            signal_candidates.append({
                "key": "transaction_cycle",
                "label": "Circular transaction flow",
                "description": "Three or more accounts repeatedly transact in a loop suggesting a closed exchange pattern.",
                "weight": 38,
                "present": True,
            })

        device_groups = [members for members in shared_devices.values() if len(members) >= 2]
        device_members = set().union(*device_groups) if device_groups else set()
        if device_members:
            signal_candidates.append({
                "key": "shared_device",
                "label": "Shared device",
                "description": "Multiple accounts are using the same device across several transfers.",
                "weight": 24,
                "present": True,
            })

        ip_groups = [members for members in shared_ips.values() if len(members) >= 2]
        ip_members = set().union(*ip_groups) if ip_groups else set()
        if ip_members:
            signal_candidates.append({
                "key": "shared_ip",
                "label": "Shared IP",
                "description": "Multiple accounts are originating from the same IP address across a synchronized pattern.",
                "weight": 20,
                "present": True,
            })

        merchant_groups = [members for members in shared_merchants.values() if len(members) >= 2]
        merchant_members = set().union(*merchant_groups) if merchant_groups else set()
        if merchant_members:
            signal_candidates.append({
                "key": "shared_merchant",
                "label": "Shared merchant",
                "description": "Several accounts interact with the same merchant in a clustered pattern.",
                "weight": 18,
                "present": True,
            })

        members = sorted({*cycle_members, *device_members, *ip_members, *merchant_members})
        if transaction_volume < 3:
            return None
        if len(members) < 2 and not signal_candidates:
            return None
        if not signal_candidates:
            return None

        if len(members) < 3 and len(cycle_members) < 3:
            return None

        detected = bool(signal_candidates)
        confidence = 50
        confidence += len(signal_candidates) * 12
        confidence += max(0, len(members) - 2) * 6
        if len(cycle_members) >= 3:
            confidence += 18
        confidence = max(0, min(99, confidence))

        member_key = "|".join(sorted(members)).encode("utf-8")
        stable_ring_number = int.from_bytes(sha256(member_key).digest()[:4], "big") % 100000
        return {
            "ringId": f"ring-{stable_ring_number:05d}",
            "confidence": int(round(confidence)),
            "members": members,
            "memberCount": len(members),
            "transactionVolume": transaction_volume,
            "amountInvolved": int(round(amount_total)),
            "currency": currency,
            "signals": [
                {
                    "key": signal["key"],
                    "label": signal["label"],
                    "description": signal["description"],
                    "weight": signal["weight"],
                    "present": True,
                }
                for signal in signal_candidates
            ],
            "detected": detected,
        }
