from __future__ import annotations

import os
from typing import Any


class AgentService:
    @staticmethod
    def _unique_evidence(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        ordered: list[dict[str, Any]] = []
        for item in sorted(items, key=lambda row: float(row.get("strength", 0) or 0), reverse=True):
            key = str(item.get("id") or item.get("label") or item.get("description") or "")
            if not key or key in seen:
                continue
            seen.add(key)
            ordered.append(item)
        return ordered

    @staticmethod
    def _deterministic_confidence(*scores: float | None) -> int:
        available_scores = [float(score) for score in scores if score is not None]
        if not available_scores:
            return 0
        avg = sum(available_scores) / len(available_scores)
        return int(max(0, min(99, round(avg))))

    @classmethod
    def build_agents(cls, stages: list[Any]) -> list[dict[str, Any]]:
        stage_map = {stage.key: stage for stage in stages}

        feature_stage = stage_map.get("feature_engine")
        ml_stage = stage_map.get("ml_intelligence")
        graph_stage = stage_map.get("graph_intelligence")
        ring_stage = stage_map.get("ring_detection")

        live_mode = os.getenv("RINGBREAK_ML_MODE", "LIVE").strip().upper() == "LIVE"
        behaviour = cls._build_behaviour_agent(feature_stage, ml_stage)
        network = cls._build_network_agent(graph_stage, ring_stage, live_mode=live_mode)
        evidence = cls._build_evidence_agent(behaviour, network, feature_stage, ml_stage, graph_stage, ring_stage, live_mode=live_mode)
        return [behaviour, network, evidence]

    @classmethod
    def _build_behaviour_agent(cls, feature_stage: Any | None, ml_stage: Any | None) -> dict[str, Any]:
        feature_output = getattr(feature_stage, "output", None) if feature_stage else None
        ml_output = getattr(ml_stage, "output", None) if ml_stage else None
        feature_output = feature_output if isinstance(feature_output, dict) else {}
        ml_output = ml_output if isinstance(ml_output, dict) else {}
        feature_evidence = list(getattr(feature_stage, "evidence", []) or [])
        ml_evidence = list(getattr(ml_stage, "evidence", []) or [])

        score_sources = {
            "anomalyScore": (ml_output, "anomalyScore"),
            "fraudProbability": (ml_output, "fraudProbability"),
            "modelConfidence": (ml_output, "confidence"),
            "amountSignal": (feature_output, "amountSignal"),
            "deviceSignal": (feature_output, "deviceSignal"),
            "locationSignal": (feature_output, "locationSignal"),
            "ipSignal": (feature_output, "ipSignal"),
            "transactionTypeSignal": (feature_output, "transactionTypeSignal"),
        }
        scores = {
            key: float(source.get(source_key))
            if isinstance(source.get(source_key), (int, float)) and not isinstance(source.get(source_key), bool)
            else None
            for key, (source, source_key) in score_sources.items()
        }
        has_feature_scores = any(scores[key] is not None for key in (
            "amountSignal", "deviceSignal", "locationSignal", "ipSignal", "transactionTypeSignal",
        ))
        has_ml_scores = any(scores[key] is not None for key in (
            "anomalyScore", "fraudProbability",
        ))
        evidence_sufficient = has_feature_scores and has_ml_scores
        evidence_reasons = []
        if not has_feature_scores:
            evidence_reasons.append("Feature Engine did not return transaction-level feature scores.")
        if not has_ml_scores:
            evidence_reasons.append("ML scoring did not return an anomaly score or fraud probability.")

        observations: list[str] = []
        if ml_output.get("classification") == "ANOMALOUS":
            observations.append(
                f"ML anomaly score indicates materially unusual transaction behaviour ({ml_output.get('anomalyScore', 0):.2f})."
            )
        elif ml_output.get("classification") == "NORMAL":
            observations.append("ML scoring remains within the expected behavioural range for this transaction.")

        if feature_output.get("unusualHour"):
            observations.append(f"Transaction occurred at an unusual hour ({feature_output.get('transactionHour')}).")
        if feature_output.get("amountSignal", 0) >= 60:
            observations.append(f"The amount signal is elevated at {feature_output.get('amountSignal')}.")
        if feature_output.get("transactionTypeSignal", 0) >= 60:
            observations.append(f"The transaction type signal is elevated at {feature_output.get('transactionTypeSignal')}.")
        if not observations and evidence_sufficient:
            observations.append("Transaction features remain within expected boundaries for routine activity.")
        elif not observations:
            observations.append("Behavioural evidence is insufficient to assess this transaction.")

        evidence = cls._unique_evidence(feature_evidence + ml_evidence)
        evidence = evidence[:5]
        feature_strength = max((item.get("strength", 0) or 0) for item in evidence) if evidence else 0
        ml_confidence = float(ml_output.get("confidence", 0.0) or 0.0) * 100.0
        confidence = (
            cls._deterministic_confidence(35.0, ml_confidence * 0.5, feature_strength * 0.4)
            if evidence_sufficient
            else None
        )

        finding = "Insufficient behavioural evidence to determine a transaction profile." if not evidence_sufficient else (
            "ML anomaly score indicates materially unusual transaction behaviour."
            if ml_output.get("classification") == "ANOMALOUS"
            else "The transaction remains within the expected behavioural envelope for routine activity."
        )
        conclusion = "Behavioural assessment is unavailable because required feature or ML evidence is missing." if not evidence_sufficient else (
            "Behavioural evidence supports a materially suspicious transaction profile backed by anomalous ML and feature signals."
            if ml_output.get("classification") == "ANOMALOUS"
            else "Behavioural evidence remains broadly consistent with normal activity and does not indicate a clear anomaly."
        )

        return {
            "agentKey": "behaviour",
            "name": "Behaviour Agent",
            "status": "complete",
            "evidenceStatus": "sufficient" if evidence_sufficient else "insufficient_evidence",
            "evidenceReason": None if evidence_sufficient else " ".join(evidence_reasons),
            "finding": finding,
            "conclusion": conclusion,
            "confidence": confidence,
            "scores": scores,
            "evidenceCount": len(evidence),
            "objective": "Analyze transaction-level behavioural and ML signals.",
            "observations": observations,
            "evidence": evidence,
        }

    @classmethod
    def _build_network_agent(cls, graph_stage: Any | None, ring_stage: Any | None, live_mode: bool = False) -> dict[str, Any]:
        graph_output = getattr(graph_stage, "output", {}) if graph_stage else {}
        ring_output = getattr(ring_stage, "output", {}) if ring_stage else {}
        graph_evidence = list(getattr(graph_stage, "evidence", []) or [])
        ring_evidence = list(getattr(ring_stage, "evidence", []) or [])

        relationships = graph_output.get("relationships", []) if isinstance(graph_output, dict) else []
        shared_device = sum(1 for rel in relationships if rel.get("type") == "SHARED_DEVICE" and (not live_mode or rel.get("weight", 1) > 1))
        shared_ip = sum(1 for rel in relationships if rel.get("type") == "SHARED_IP" and (not live_mode or rel.get("weight", 1) > 1))
        shared_merchant = sum(1 for rel in relationships if rel.get("type") == "SHARED_MERCHANT" and (not live_mode or rel.get("weight", 1) > 1))
        ring_members = ring_output.get("members", []) if isinstance(ring_output, dict) else []
        coordinated_network = bool(ring_members or shared_device or shared_ip or shared_merchant)

        observations: list[str] = []
        if ring_members:
            observations.append(f"Detected ring membership across {len(ring_members)} accounts: {', '.join(ring_members[:5])}.")
        if shared_device:
            observations.append(f"Graph analysis shows {shared_device} shared-device relationship(s) between accounts.")
        if shared_ip:
            observations.append(f"Graph analysis shows {shared_ip} shared-IP relationship(s) between accounts.")
        if shared_merchant:
            observations.append(f"Graph analysis shows {shared_merchant} shared-merchant relationship(s) between accounts.")
        if not observations:
            observations.append("Graph connectivity remains limited and does not indicate a coordinated cluster.")

        evidence = cls._unique_evidence(graph_evidence + ring_evidence)
        evidence = evidence[:6]
        confidence = cls._deterministic_confidence(
            25.0,
            18.0 if ring_members else 0.0,
            min(30.0, (shared_device + shared_ip + shared_merchant) * 10.0),
            min(20.0, len(ring_members) * 4.0),
        )
        if not evidence:
            evidence = [
                {
                    "id": "network-fallback",
                    "label": "Network structure",
                    "description": "The graph remains sparse and no strong infrastructure clustering was observed.",
                    "strength": 12,
                    "source": "graph_intelligence",
                    "timestamp": "1970-01-01T00:00:00Z",
                    "relationship": "transaction",
                }
            ]

        finding = (
            "Multiple accounts share infrastructure and graph connectivity forms a suspicious cluster."
            if coordinated_network
            else "The graph remains largely sparse and does not show coordinated account clustering."
        )
        conclusion = (
            "Network evidence supports coordination across accounts, devices, and infrastructure sources."
            if coordinated_network
            else "Network evidence does not indicate a coordinated account cluster or ring condition."
        )

        return {
            "agentKey": "network",
            "name": "Network Agent",
            "status": "complete",
            "finding": finding,
            "conclusion": conclusion,
            "confidence": confidence,
            "evidenceCount": len(evidence),
            "objective": "Analyze graph connectivity and ring evidence.",
            "observations": observations,
            "evidence": evidence,
        }

    @classmethod
    def _build_evidence_agent(
        cls,
        behaviour: dict[str, Any],
        network: dict[str, Any],
        feature_stage: Any | None,
        ml_stage: Any | None,
        graph_stage: Any | None,
        ring_stage: Any | None,
        live_mode: bool = False,
    ) -> dict[str, Any]:
        all_evidence: list[dict[str, Any]] = []
        for stage in (feature_stage, ml_stage, graph_stage, ring_stage):
            if stage is not None:
                all_evidence.extend(list(getattr(stage, "evidence", []) or []))
        all_evidence.extend(behaviour.get("evidence", []))
        all_evidence.extend(network.get("evidence", []))
        ranked = cls._unique_evidence(all_evidence)
        if live_mode:
            top_evidence: list[dict[str, Any]] = []
            seen_ids: set[str] = set()
            for source_agent in (behaviour, network):
                if source_agent.get("evidence"):
                    item = source_agent["evidence"][0]
                    item_id = str(item.get("id") or item.get("label") or item.get("description") or "")
                    if item_id and item_id not in seen_ids:
                        top_evidence.append(item)
                        seen_ids.add(item_id)
            for item in ranked:
                item_id = str(item.get("id") or item.get("label") or item.get("description") or "")
                if item_id and item_id not in seen_ids:
                    top_evidence.append(item)
                    seen_ids.add(item_id)
                if len(top_evidence) >= 8:
                    break
        else:
            top_evidence = ranked[:8]

        summary_bits: list[str] = []
        behaviour_confidence = float(behaviour.get("confidence") or 0)
        network_confidence = float(network.get("confidence") or 0)
        if live_mode:
            if behaviour.get("evidence"):
                summary_bits.append(f"Behaviour Agent supplied {len(behaviour['evidence'])} feature and ML evidence item(s).")
            if network.get("evidence"):
                summary_bits.append(f"Network Agent supplied {len(network['evidence'])} graph and ring evidence item(s).")
        elif behaviour_confidence >= 60:
            summary_bits.append("Behavioural evidence is elevated by ML anomaly scoring.")
        elif network_confidence >= 60:
            summary_bits.append("Network evidence shows infrastructure clustering and structural coordination.")
        if not summary_bits:
            summary_bits.append("The available evidence remains consistent with normal, low-risk activity.")

        if live_mode:
            conclusion = (
                "The strongest evidence combines current behavioural and network signals for this investigation."
                if behaviour.get("evidence") and network.get("evidence")
                else "The available evidence is limited to the signals produced by the current investigation."
            )
        elif behaviour_confidence >= 60 or network_confidence >= 60:
            conclusion = "The strongest evidence combines anomalous transaction behaviour with supporting structural and network signals, materially increasing suspicion."
        else:
            conclusion = "The strongest evidence remains modest and consistent with ordinary transaction activity rather than coordinated fraud behaviour."

        finding = (
            "The evidence set combines current behavioural and network indicators."
            if live_mode and behaviour.get("evidence") and network.get("evidence")
            else "The strongest evidence combines behavioural, structural, and network indicators into a coherent investigative summary."
        )

        confidence = cls._deterministic_confidence(behaviour.get("confidence", 0), network.get("confidence", 0))
        return {
            "agentKey": "evidence",
            "name": "Evidence Agent",
            "status": "complete",
            "finding": finding,
            "conclusion": conclusion,
            "confidence": confidence,
            "evidenceCount": len(top_evidence),
            "objective": "Consolidate the strongest evidence from the previous pipeline.",
            "observations": summary_bits,
            "evidence": top_evidence,
        }
