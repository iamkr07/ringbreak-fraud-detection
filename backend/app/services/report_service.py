from __future__ import annotations

from typing import Any


class ReportService:
    @staticmethod
    def _dedupe_evidence(stages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        evidence: list[dict[str, Any]] = []
        seen: set[str] = set()
        for stage in stages:
            for item in stage.get("evidence", []) or []:
                if not isinstance(item, dict):
                    continue
                key = str(item.get("id") or "")
                if key and key in seen:
                    continue
                if key:
                    seen.add(key)
                evidence.append(item)
        return evidence

    @classmethod
    def build_report(
        cls,
        investigation: dict[str, Any],
        event: dict[str, Any],
        trace: dict[str, Any],
        stages: list[dict[str, Any]],
    ) -> dict[str, Any]:
        by_key = {str(stage.get("key")): stage for stage in stages}
        risk = investigation.get("riskAssessment")
        ring = investigation.get("ring")
        agents = investigation.get("agents") or []
        countermeasure = investigation.get("response")
        transaction = event.get("payload") or investigation.get("payload") or {}
        evidence = cls._dedupe_evidence(stages)
        timeline = [
            {
                "index": stage.get("index"),
                "key": stage.get("key"),
                "label": stage.get("label"),
                "status": stage.get("status"),
                "durationMs": stage.get("durationMs"),
                "startedAt": stage.get("startedAt"),
                "completedAt": stage.get("completedAt"),
            }
            for stage in stages
        ]

        severity = str((risk or {}).get("severity", "UNKNOWN"))
        ring_text = (
            f" Ring detection identified {len(ring.get('members', []))} connected accounts."
            if isinstance(ring, dict) and ring.get("detected")
            else " No ring pattern was identified."
        )
        conclusion = (
            f"Investigation {investigation.get('investigationId')} concluded with {severity} risk and a simulated "
            f"countermeasure of {(countermeasure or {}).get('recommendedAction', 'NONE')}." + ring_text
        )
        summary = (
            f"{transaction.get('amount', 0)} {transaction.get('currency', '')} {transaction.get('transactionType', '')} "
            f"from {transaction.get('senderAccount', '')} to {transaction.get('receiverAccount', '')}."
        ).strip()
        graph_findings = by_key.get("graph_intelligence", {}).get("output")
        ml_findings = by_key.get("ml_intelligence", {}).get("output")

        return {
            "investigationId": investigation.get("investigationId"),
            "eventId": investigation.get("eventId"),
            "traceId": investigation.get("traceId"),
            "summary": summary,
            "transaction": transaction,
            "riskAssessment": risk,
            "ringDetection": ring,
            "graphFindings": graph_findings,
            "agentFindings": agents,
            "countermeasure": countermeasure,
            "evidence": evidence,
            "timeline": timeline,
            "conclusion": conclusion,
            "generatedAt": trace.get("createdAt") or investigation.get("updatedAt"),
            "transactionSummary": summary,
            "payload": transaction,
            "risk": risk,
            "ring": ring,
            "agents": agents,
            "evidenceTimeline": evidence,
            "response": countermeasure,
            "mlFindings": ml_findings,
            "networkFindings": graph_findings,
        }
