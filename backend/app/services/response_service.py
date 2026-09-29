from __future__ import annotations

from typing import Any


class ResponseService:
    @staticmethod
    def _evidence_references(
        risk_assessment: dict[str, Any],
        ring_output: dict[str, Any] | None,
        ml_output: dict[str, Any] | None,
        agent_output: list[dict[str, Any]] | None,
    ) -> list[str]:
        references: list[str] = []
        if ring_output and ring_output.get("detected"):
            references.append("Circular transaction pattern")
            signals = ring_output.get("signals", []) or []
            for signal in signals:
                if isinstance(signal, dict) and signal.get("present"):
                    label = str(signal.get("label", "")).strip()
                    if label and label not in references:
                        references.append(label)
        if ml_output and str(ml_output.get("classification", "")).upper() == "ANOMALOUS":
            references.append("ML anomaly score")
        for factor in risk_assessment.get("contributingFactors", []) or []:
            if factor not in references and len(references) < 5:
                references.append(str(factor))
        if agent_output and any(float(agent.get("confidence", 0) or 0) >= 60 for agent in agent_output if isinstance(agent, dict)):
            references.append("Investigator-agent corroboration")
        return references[:5]

    @classmethod
    def recommend_response(
        cls,
        risk_assessment: dict[str, Any] | None,
        ring_output: dict[str, Any] | None = None,
        ml_output: dict[str, Any] | None = None,
        agent_output: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        risk = risk_assessment or {}
        score = float(risk.get("riskScore", 0) or 0)
        severity = str(risk.get("severity", "LOW") or "LOW").upper()
        ring_detected = bool((ring_output or {}).get("detected", False))

        if ring_detected or severity == "CRITICAL" or score >= 85:
            response_type = "TRANSACTION_HOLD"
            action = "BLOCK_TRANSACTION / FREEZE_LINKED_ENTITIES / ESCALATE"
            reason = f"{severity.title()} risk score ({int(round(score))}/100) with corroborated ring or fraud evidence."
        elif severity == "HIGH" or score >= 70:
            response_type = "ACCOUNT_PROTECTION"
            action = "HOLD_TRANSACTION / ESCALATE"
            reason = f"High risk score ({int(round(score))}/100) warrants immediate account protection measures."
        elif severity == "MEDIUM" or score >= 40:
            response_type = "ADDITIONAL_VERIFICATION"
            action = "ENHANCED_MONITORING / FLAG"
            reason = f"Moderate risk score ({int(round(score))}/100) requires additional identity verification."
        elif score > 0:
            response_type = "ENHANCED_MONITORING"
            action = "MONITOR"
            reason = f"Low risk score ({int(round(score))}/100) is retained for passive monitoring."
        else:
            response_type = "NONE"
            action = "NO ACTION"
            reason = "No risk assessment evidence requires a countermeasure."

        confidence = int(max(0, min(99, round(float(risk.get("confidence", 0) or 0)))))
        return {
            "type": response_type,
            "status": "RECOMMENDED",
            "recommendedAction": action,
            "reason": reason,
            "triggeringEvidence": cls._evidence_references(risk, ring_output, ml_output, agent_output),
            "confidence": confidence,
            "simulated": True,
        }

    @staticmethod
    def simulate_response(
        response: dict[str, Any],
        investigation_id: str,
        timestamp: str,
    ) -> dict[str, Any]:
        existing_action_id = response.get("actionId")
        action_id = str(existing_action_id or f"SIM-{investigation_id}")
        return {
            **response,
            "actionId": action_id,
            "actionType": response.get("type", "NONE"),
            "status": "SIMULATED",
            "timestamp": response.get("timestamp", timestamp),
            "investigationId": investigation_id,
            "supportingEvidence": response.get("triggeringEvidence", []),
            "auditNote": "Simulation only - no external financial action performed.",
            "simulated": True,
        }
