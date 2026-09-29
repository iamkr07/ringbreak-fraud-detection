from __future__ import annotations

from typing import Any

# Preserve the legacy strong-ML maximum: 28 base points plus up to 22 more.
ML_MAX_POINTS = 50.0


class RiskAssessmentService:
    @staticmethod
    def _severity_for(score: int) -> str:
        if score >= 90:
            return "CRITICAL"
        if score >= 70:
            return "HIGH"
        if score >= 40:
            return "MEDIUM"
        return "LOW"

    @staticmethod
    def _clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
        return max(lower, min(upper, value))

    @classmethod
    def evaluate_risk(
        cls,
        ml_output: dict[str, Any] | None,
        ring_output: dict[str, Any] | None,
        agent_output: list[dict[str, Any]] | None,
        graph_output: dict[str, Any] | None,
    ) -> dict[str, Any]:
        ml_payload = ml_output or {}
        ml_probability = ml_payload.get("fraudProbability")
        ml_metric_label = "Fraud probability"
        if ml_probability is None:
            ml_probability = ml_payload.get("anomalyScore", 0.0)
            ml_metric_label = "ML anomaly score"
        ml_score = cls._clamp(float(ml_probability or 0.0) * 100.0)

        ring_payload = ring_output or {}
        ring_confidence = float(ring_payload.get("confidence", 0) or 0)
        ring_members = ring_payload.get("members", []) or []
        ring_signals = ring_payload.get("signals", []) or []
        ring_signal_weight = sum(
            float(signal.get("weight", 0) or 0)
            for signal in ring_signals
            if isinstance(signal, dict)
        )
        ring_signal_present = any(
            isinstance(signal, dict) and bool(signal.get("present", False))
            for signal in ring_signals
        )
        ring_detected = bool(ring_payload.get("detected", False)) or (
            len(ring_members) >= 3 and ring_signal_present and ring_signal_weight >= 30
        )

        graph_relationships = (graph_output or {}).get("relationships", []) if isinstance(graph_output, dict) else []
        shared_count = sum(
            1
            for rel in graph_relationships
            if rel.get("type") in {"SHARED_DEVICE", "SHARED_IP", "SHARED_MERCHANT"}
            and rel.get("weight", 1) > 1
        )

        agent_confidences = [float(agent.get("confidence", 0) or 0) for agent in (agent_output or []) if isinstance(agent, dict)]
        average_agent_confidence = sum(agent_confidences) / len(agent_confidences) if agent_confidences else 0.0

        score = 6
        factors: list[str] = []
        factor_contributions: list[dict[str, Any]] = []
        evidence_refs: list[str] = []

        if ring_detected:
            ring_points = (
                38
                + min(28, ring_confidence * 0.24)
                + min(18, max(0, len(ring_members) - 2) * 7)
                + min(20, ring_signal_weight * 0.12)
            )
            score += 38
            score += min(28, ring_confidence * 0.24)
            score += min(18, max(0, len(ring_members) - 2) * 7)
            score += min(20, ring_signal_weight * 0.12)
            factor_contributions.append({
                "key": "ring_detection",
                "label": "Ring detection",
                "points": ring_points,
                "detail": f"Ring detection flagged {len(ring_members)} connected accounts.",
            })
            factors.append(f"Ring detection flagged {len(ring_members)} connected accounts.")
            evidence_refs.append("ring_detection")
        else:
            factors.append("No active ring pattern was detected.")

        ml_signal_strength = max(
            (float(signal.get("contribution", 0) or 0) for signal in (ml_payload.get("signals", []) or []) if isinstance(signal, dict)),
            default=0.0,
        )
        strong_ml_signal = ml_score >= 75 and ml_signal_strength >= 0.7
        ml_points = ML_MAX_POINTS * ml_score / 100.0
        score += ml_points
        if ml_score > 0:
            factors.append(f"{ml_metric_label} adds {ml_points:.4f} of {ML_MAX_POINTS:g} available ML risk points.")
            evidence_refs.append("ml_intelligence")
        else:
            factors.append(f"{ml_metric_label} is 0/100 and adds no ML risk points.")

        if ml_payload:
            factor_contributions.append({
                "key": "ml_intelligence",
                "label": "ML intelligence",
                "points": ml_points,
                "detail": f"{ml_metric_label} {ml_score:.4f}/100 maps linearly to {ml_points:.4f} of {ML_MAX_POINTS:g} ML risk points.",
            })

        if shared_count >= 3:
            graph_points = min(18, shared_count * 6)
            score += min(18, shared_count * 6)
            factors.append("Graph relationships show shared infrastructure usage across multiple accounts.")
            evidence_refs.append("graph_intelligence")
        elif shared_count:
            graph_points = min(12, shared_count * 4)
            score += min(12, shared_count * 4)
            factors.append("Graph relationships show shared infrastructure usage across multiple accounts.")
            evidence_refs.append("graph_intelligence")
        else:
            graph_points = 0
            factors.append("Graph connectivity remains limited and does not show coordinated infrastructure reuse.")

        if shared_count:
            factor_contributions.append({
                "key": "graph_intelligence",
                "label": "Graph intelligence",
                "points": graph_points,
                "detail": f"{shared_count} shared infrastructure relationship(s) contributed to the assessment.",
            })

        if agent_output:
            factors.append("Investigator agents supplied contextual findings; their confidence is not added to fraud risk.")
            evidence_refs.extend(agent.get("agentKey", "unknown") for agent in agent_output if isinstance(agent, dict))

        if ring_detected:
            score = max(score, 72)
        elif strong_ml_signal:
            score = max(score, 68)

        score = int(cls._clamp(score, 0, 100))

        severity = cls._severity_for(score)

        confidence = int(cls._clamp((score * 0.7) + (average_agent_confidence * 0.3), 0, 99))
        explanation = (
            "The transaction shows a low-risk profile with stable ML behaviour and no coordinated infrastructure patterns."
            if severity == "LOW"
            else (
                "The transaction exhibits elevated risk driven by anomalous behaviour, graph clustering, or ring indicators that materially increase threat likelihood."
                if severity in {"MEDIUM", "HIGH"}
                else "The transaction presents a critical pattern combining anomaly signals, infrastructure coordination, and high-confidence investigator findings."
            )
        )

        deduped_factors = []
        seen: set[str] = set()
        for factor in factors:
            if factor not in seen:
                deduped_factors.append(factor)
                seen.add(factor)

        deduped_refs = []
        seen_refs: set[str] = set()
        for ref in evidence_refs:
            if ref not in seen_refs:
                deduped_refs.append(ref)
                seen_refs.add(ref)

        total_factor_points = sum(float(item["points"]) for item in factor_contributions)
        structured_factors: list[dict[str, Any]] = []
        for item in factor_contributions:
            points = float(item["points"])
            if points <= 0:
                continue
            structured_factors.append({
                "key": item["key"],
                "label": item["label"],
                "score": int(cls._clamp(round(points))),
                "weight": round(points / total_factor_points, 6) if total_factor_points else 0,
                "detail": item["detail"],
            })

        assessment = {
            "riskScore": score,
            "severity": severity,
            "confidence": confidence,
            "contributingFactors": deduped_factors,
            "factors": structured_factors,
            "evidenceReferences": deduped_refs,
            "explanation": explanation,
        }
        for metric in ("fraudProbability", "evidenceStrength"):
            if metric in ml_payload and ml_payload[metric] is not None:
                assessment[metric] = ml_payload[metric]
        return assessment
