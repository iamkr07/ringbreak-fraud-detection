from __future__ import annotations

import os
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, status, Response
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.event import EventRecord
from app.models.feature import FeatureRecord
from app.models.investigation import InvestigationRecord
from app.models.trace_model import TraceRecord, TraceStageRecord
from app.schemas.payload import ScenarioInvestigationRequest, TransactionPayload
from app.schemas.event_schema import EventSchema
from app.schemas.investigation_schema import InvestigationSchema
from app.schemas.trace_schema import TraceSchema
from app.services.agent_service import AgentService
from app.services.amlsim_service import amlsim_service
from app.services.feature_service import FeatureService
from app.services.graph_service import GraphService
from app.services.ml_service import LIVE_MODEL_NAME, MODEL_NAME, MLService
from app.services.risk_service import RiskAssessmentService
from app.services.ring_service import RingService
from app.services.response_service import ResponseService
from app.services.report_service import ReportService
router = APIRouter()


@router.get("/amlsim/status")
def get_amlsim_status() -> dict[str, Any]:
    return amlsim_service.get_status()


@router.get("/amlsim/transactions")
def get_amlsim_transactions(
    offset: int = 0,
    limit: int = 50,
    is_fraud: bool | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    return amlsim_service.load_transactions(offset=offset, limit=limit, is_fraud=is_fraud, search=search)


@router.get("/amlsim/transactions/{transaction_id}")
def get_amlsim_transaction(transaction_id: str) -> dict[str, Any]:
    transaction = amlsim_service.get_transaction(transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim transaction not found")
    return transaction


@router.get("/amlsim/accounts")
def get_amlsim_accounts(offset: int = 0, limit: int = 50) -> list[dict[str, Any]]:
    return amlsim_service.load_accounts(offset=offset, limit=limit)


@router.get("/amlsim/accounts/{account_id}")
def get_amlsim_account(account_id: str) -> dict[str, Any]:
    account = amlsim_service.get_account(account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim account not found")
    return account


@router.get("/amlsim/alerts")
def get_amlsim_alerts() -> list[dict[str, Any]]:
    return amlsim_service.load_alerts()


@router.get("/amlsim/alerts/{alert_id}")
def get_amlsim_alert(alert_id: str) -> dict[str, Any]:
    alert = amlsim_service.get_alert(alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim alert not found")
    return alert


@router.get("/amlsim/patterns")
def get_amlsim_patterns() -> list[dict[str, Any]]:
    return amlsim_service.get_pattern_clusters()


@router.get("/amlsim/presets")
def get_amlsim_presets() -> dict[str, list[dict[str, Any]]]:
    return amlsim_service.get_presets()


@router.get("/amlsim/investigate/{transaction_id}")
def investigate_amlsim_transaction(transaction_id: str) -> dict[str, Any]:
    case = amlsim_service.investigate_transaction(transaction_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim transaction not found")
    return case


@router.get("/amlsim/ring-check/{transaction_id}")
def check_amlsim_ring(transaction_id: str) -> dict[str, Any]:
    """
    Check whether the given AMLSim transaction participates in a ring/coordination pattern.
    Returns ring detection result including members, signals, and related transactions.
    """
    return amlsim_service.check_ring_for_transaction(transaction_id)


@router.get("/gnn/cliques/{transaction_id}")
def get_gnn_cliques_for_transaction(transaction_id: str) -> dict[str, Any]:
    """
    Exposes GNN Graph Attention Network prediction, structural clique, and edge attention weights.
    """
    amlsim_service._ensure_loaded()
    tx = amlsim_service.get_transaction(transaction_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim transaction not found")
    from app.services.gnn_service import gnn_service
    return gnn_service.evaluate_clique_for_transaction(tx, amlsim_service._transactions)


@router.get("/gnn/memory/node/{account_id}")
def get_node_neo4j_ring_history(account_id: str) -> dict[str, Any]:
    """
    Queries Neo4j database for an account's historical ring membership, repeat offender status, and past co-conspirators.
    """
    from app.services.neo4j_service import neo4j_service
    return neo4j_service.get_node_ring_history(account_id)


@router.post("/gnn/memory/persist-ring")
def persist_ring_to_neo4j(ring_data: dict[str, Any]) -> dict[str, Any]:
    """
    Persists a confirmed ring cluster and its member accounts into Neo4j database.
    """
    from app.services.neo4j_service import neo4j_service
    return neo4j_service.store_confirmed_ring(ring_data)


@router.get("/amlsim/presets/refresh")
def refresh_amlsim_presets(
    offset: int = 0,
    fraud_offset: int = 0,
) -> dict[str, list[dict[str, Any]]]:
    """
    Return a fresh slice of 5 benign and 5 fraud transactions at the given offsets,
    enabling the frontend refresh button to cycle through different records.
    """
    return amlsim_service.get_presets_at(offset=offset, fraud_offset=fraud_offset)


@router.get("/demo/case")
def get_demo_case() -> dict[str, Any]:
    demo_id = "d3d6665f-4491-4632-81b9-ab1365b57cb8"
    try:
        inv = get_investigation_by_id(demo_id)
        return inv.model_dump() if hasattr(inv, "model_dump") else inv.dict()
    except Exception:
        db = SessionLocal()
        try:
            fallback = db.query(InvestigationRecord).filter(InvestigationRecord.state == "RING_DETECTED").first() or db.query(InvestigationRecord).first()
            if fallback:
                inv = get_investigation_by_id(fallback.investigation_id)
                return inv.model_dump() if hasattr(inv, "model_dump") else inv.dict()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo investigation not found in database")
        finally:
            db.close()


def payload_to_dict(payload: TransactionPayload | dict[str, Any]) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    if hasattr(payload, "dict"):
        return payload.dict()
    return dict(payload)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def stage_to_report_dict(stage: TraceStageRecord) -> dict[str, Any]:
    return {
        "index": stage.index,
        "key": stage.key,
        "label": stage.label,
        "status": stage.status,
        "durationMs": stage.duration_ms,
        "startedAt": stage.started_at,
        "completedAt": stage.completed_at,
        "input": stage.input,
        "output": stage.output,
        "evidence": stage.evidence,
    }


def unique_trace_stages(stages: list[TraceStageRecord]) -> list[TraceStageRecord]:
    seen: set[str] = set()
    unique: list[TraceStageRecord] = []
    for stage in sorted(stages, key=lambda item: (item.index, item.id)):
        if stage.key in seen:
            continue
        seen.add(stage.key)
        unique.append(stage)
    return unique


def build_report_payload(
    investigation: InvestigationRecord,
    event: EventRecord,
    trace: TraceRecord,
    stages: list[TraceStageRecord],
) -> dict[str, Any]:
    return ReportService.build_report(
        investigation={
            "investigationId": investigation.investigation_id,
            "eventId": investigation.event_id,
            "traceId": investigation.trace_id,
            "payload": investigation.payload,
            "riskAssessment": investigation.risk_assessment,
            "ring": investigation.ring,
            "agents": investigation.agents,
            "response": investigation.response,
        },
        event={"payload": event.payload},
        trace={"traceId": trace.trace_id, "createdAt": trace.created_at},
        stages=[stage_to_report_dict(stage) for stage in stages],
    )


@router.post("/transactions/inject", response_model=EventSchema, status_code=status.HTTP_200_OK)
def inject_transaction(payload: TransactionPayload, correlation_id: str | None = Header(default=None, alias="X-Correlation-ID")) -> EventSchema:
    return _process_transaction(payload, correlation_id)


def _process_transaction(
    payload: TransactionPayload,
    correlation_id: str | None,
    model_features: dict[str, Any] | None = None,
    replay_metadata: dict[str, Any] | None = None,
    graph_events_override: list[dict[str, Any]] | None = None,
) -> EventSchema:
    db = SessionLocal()
    try:
        event_id = str(uuid4())
        trace_id = str(uuid4())
        investigation_id = str(uuid4())
        correlation_scope = correlation_id or str(uuid4())
        received_at = __import__("datetime").datetime.utcnow().isoformat() + "Z"

        payload_data = payload_to_dict(payload)

        event = EventRecord(
            event_id=event_id,
            trace_id=trace_id,
            investigation_id=investigation_id,
            correlation_id=correlation_scope,
            received_at=received_at,
            ingestion_status="accepted",
            payload=payload_data,
        )
        db.add(event)
        db.flush()

        investigation = InvestigationRecord(
            investigation_id=investigation_id,
            event_id=event_id,
            trace_id=trace_id,
            state="RECEIVED",
            created_at=received_at,
            updated_at=received_at,
            payload=payload_data,
        )
        db.add(investigation)
        db.flush()

        trace = TraceRecord(
            trace_id=trace_id,
            event_id=event_id,
            investigation_id=investigation_id,
            created_at=received_at,
            state="RECEIVED",
        )
        db.add(trace)
        db.flush()

        ingestion_input = {
            "source": "scenario_preset" if replay_metadata is not None and replay_metadata.get("workflow") == "preset" else "live_ingest" if replay_metadata is not None else "payload_lab",
            "payload": payload_data,
        }
        if replay_metadata is not None:
            ingestion_input["provenance"] = replay_metadata
            if replay_metadata.get("workflow") != "preset":
                ingestion_input["replay"] = replay_metadata
        ingestion_stage = TraceStageRecord(
            trace_id=trace_id,
            index=1,
            key="ingestion",
            label="INGESTION",
            status="complete",
            duration_ms=42,
            started_at=received_at,
            completed_at=received_at,
            input=ingestion_input,
            output={"eventId": event_id, "status": "accepted"},
            evidence=[],
        )
        if model_features is None:
            model_features = {}
        if "oldbalanceOrg" not in model_features:
            sender_acc = amlsim_service.get_account(payload.senderAccount)
            receiver_acc = amlsim_service.get_account(payload.receiverAccount)
            amt = float(payload.amount or 0.0)
            s_bal = float(sender_acc.get("initialBalance", 0.0) or 0.0) if sender_acc else max(50000.0, amt * 3)
            r_bal = float(receiver_acc.get("initialBalance", 0.0) or 0.0) if receiver_acc else 25000.0
            model_features.setdefault("oldbalanceOrg", s_bal)
            model_features.setdefault("newbalanceOrig", max(0.0, s_bal - amt))
            model_features.setdefault("oldbalanceDest", r_bal)
            model_features.setdefault("newbalanceDest", r_bal + amt)

        features = FeatureService().extract(payload, model_features=model_features)
        feature_record = FeatureRecord(
            feature_id=str(uuid4()),
            event_id=event_id,
            trace_id=trace_id,
            features=features,
            created_at=received_at,
        )
        db.add(feature_record)
        db.flush()

        feature_stage = TraceStageRecord(
            trace_id=trace_id,
            index=2,
            key="feature_engine",
            label="FEATURE ENGINE",
            status="complete",
            duration_ms=80,
            started_at=received_at,
            completed_at=received_at,
            input={
                "amount": payload.amount,
                "transactionType": payload.transactionType,
                "currency": payload.currency,
                "deviceId": payload.deviceId,
                "ipAddress": payload.ipAddress,
                "location": payload.location,
                "merchantId": payload.merchantId,
            },
            output=features,
            evidence=features.get("evidence", []),
        )
        db.add(feature_stage)

        ml_result, ml_evidence = MLService.analyze(features)
        ml_feature_vector = MLService.build_feature_vector(features)
        ml_stage_input = {
            "featureVector": ml_feature_vector,
            "features": {k: v for k, v in features.items() if k in MLService.FEATURE_KEYS},
        }
        if model_features is not None:
            ml_stage_input["modelFeatures"] = model_features
        ml_stage = TraceStageRecord(
            trace_id=trace_id,
            index=3,
            key="ml_intelligence",
            label="ML INTELLIGENCE",
            status="complete",
            duration_ms=120,
            started_at=received_at,
            completed_at=received_at,
            input=ml_stage_input,
            output=ml_result,
            evidence=ml_evidence,
        )
        db.add(ml_stage)

        scoped_events = db.query(EventRecord).filter(EventRecord.correlation_id == correlation_scope).all()
        graph_events = graph_events_override
        if graph_events is None:
            graph_events = [{"payload": prior.payload} for prior in scoped_events]
        graph_payload = GraphService.build_network_graph_from_events(graph_events)
        graph_evidence = GraphService.build_graph_evidence(graph_events)
        graph_stage = TraceStageRecord(
            trace_id=trace_id,
            index=4,
            key="graph_intelligence",
            label="GRAPH INTELLIGENCE",
            status="complete",
            duration_ms=120,
            started_at=received_at,
            completed_at=received_at,
            input={"eventCount": len(graph_events), "entities": [item["id"] for item in graph_payload["entities"]]},
            output=graph_payload,
            evidence=graph_evidence,
        )
        db.add(graph_stage)

        ring_candidate = RingService.detect_ring(graph_events)
        if ring_candidate is not None and graph_events_override is not None:
            ring_candidate["verifiedRelationships"] = [
                {
                    "sourceRowNumber": event.get("sourceRowNumber"),
                    "senderAccount": event["payload"].get("senderAccount"),
                    "receiverAccount": event["payload"].get("receiverAccount"),
                    "type": "TRANSACTION",
                }
                for event in graph_events_override
            ]
            supporting_row_numbers = _source_cycle_row_numbers(graph_events_override)
            ring_candidate["supportingRows"] = [
                relationship for relationship in ring_candidate["verifiedRelationships"]
                if relationship["sourceRowNumber"] in supporting_row_numbers
            ]
        ring_stage = None
        if ring_candidate is not None:
            ring_stage = TraceStageRecord(
                trace_id=trace_id,
                index=5,
                key="ring_detection",
                label="RING DETECTION",
                status="complete",
                duration_ms=95,
                started_at=received_at,
                completed_at=received_at,
                input={"eventCount": len(graph_events), "members": ring_candidate.get("members", [])},
                output=ring_candidate,
                evidence=[
                    {
                        "id": f"ring-signal-{signal['key']}",
                        "label": signal["label"],
                        "description": signal["description"],
                        "strength": int(signal["weight"]),
                        "source": "ring_detection",
                        "timestamp": received_at,
                        "relationship": signal["key"],
                    }
                    for signal in ring_candidate.get("signals", [])
                ],
            )
            db.add(ring_stage)
            related_members = set(ring_candidate.get("members", []))
            for relevant_event in scoped_events:
                payload = relevant_event.payload or {}
                sender = str(payload.get("senderAccount", "")).strip()
                receiver = str(payload.get("receiverAccount", "")).strip()
                if sender in related_members or receiver in related_members:
                    relevant_investigation = db.query(InvestigationRecord).filter(InvestigationRecord.event_id == relevant_event.event_id).first()
                    if relevant_investigation is not None:
                        relevant_investigation.ring = ring_candidate
                        relevant_investigation.state = "RING_DETECTED"
                        relevant_trace = db.query(TraceRecord).filter(TraceRecord.trace_id == relevant_investigation.trace_id).first()
                        if relevant_trace is not None:
                            relevant_trace.state = "RING_DETECTED"
                            ml_stage = db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == relevant_trace.trace_id, TraceStageRecord.key == "ml_intelligence").first()
                            graph_stage = db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == relevant_trace.trace_id, TraceStageRecord.key == "graph_intelligence").first()
                            agent_stage = db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == relevant_trace.trace_id, TraceStageRecord.key == "investigator_agents").first()
                            if ml_stage is not None and graph_stage is not None:
                                relevant_investigation.risk_assessment = RiskAssessmentService.evaluate_risk(
                                    ml_output=ml_stage.output,
                                    ring_output=ring_candidate,
                                    agent_output=(agent_stage.output or {}).get("agents", []) if agent_stage is not None else [],
                                    graph_output=graph_stage.output,
                                )
                                relevant_investigation.response = ResponseService.recommend_response(
                                    risk_assessment=relevant_investigation.risk_assessment,
                                    ring_output=ring_candidate,
                                    ml_output=ml_stage.output,
                                    agent_output=(agent_stage.output or {}).get("agents", []) if agent_stage is not None else [],
                                )
                                response_stage = db.query(TraceStageRecord).filter(
                                    TraceStageRecord.trace_id == relevant_trace.trace_id,
                                    TraceStageRecord.key == "response",
                                ).first()
                                if response_stage is not None:
                                    response_stage.output = relevant_investigation.response
                                countermeasure_stage = db.query(TraceStageRecord).filter(
                                    TraceStageRecord.trace_id == relevant_trace.trace_id,
                                    TraceStageRecord.key == "countermeasure",
                                ).first()
                                if countermeasure_stage is not None:
                                    countermeasure_stage.output = relevant_investigation.response
                            if not db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == relevant_trace.trace_id, TraceStageRecord.key == "ring_detection").first():
                                ring_stage_for_trace = TraceStageRecord(
                                    trace_id=relevant_trace.trace_id,
                                    index=5,
                                    key="ring_detection",
                                    label="RING DETECTION",
                                    status="complete",
                                    duration_ms=95,
                                    started_at=relevant_trace.created_at,
                                    completed_at=relevant_trace.created_at,
                                    input={"eventCount": len(graph_events), "members": ring_candidate.get("members", [])},
                                    output=ring_candidate,
                                    evidence=[
                                        {
                                            "id": f"ring-signal-{signal['key']}",
                                            "label": signal["label"],
                                            "description": signal["description"],
                                            "strength": int(signal["weight"]),
                                            "source": "ring_detection",
                                            "timestamp": relevant_trace.created_at,
                                            "relationship": signal["key"],
                                        }
                                        for signal in ring_candidate.get("signals", [])
                                    ],
                                )
                                db.add(ring_stage_for_trace)
                                db.flush()
                            report_stages = db.query(TraceStageRecord).filter(
                                TraceStageRecord.trace_id == relevant_trace.trace_id,
                                TraceStageRecord.key != "report_generation",
                            ).order_by(TraceStageRecord.index, TraceStageRecord.id).all()
                            relevant_investigation.report = build_report_payload(
                                investigation=relevant_investigation,
                                event=relevant_event,
                                trace=relevant_trace,
                                stages=report_stages,
                            )
            investigation.ring = ring_candidate
            trace.state = "RING_DETECTED"
            investigation.state = "RING_DETECTED"
        else:
            trace.state = "GRAPH_ANALYZED"
            investigation.state = "GRAPH_ANALYZED"

        stages = [
            ingestion_stage,
            feature_stage,
            ml_stage,
            graph_stage,
            ring_stage,
        ]
        agent_findings = AgentService.build_agents([stage for stage in stages if stage is not None])
        investigation.agents = agent_findings
        trace.state = investigation.state

        agent_stage = TraceStageRecord(
            trace_id=trace_id,
            index=6,
            key="investigator_agents",
            label="INVESTIGATOR AGENTS",
            status="complete",
            duration_ms=110,
            started_at=received_at,
            completed_at=received_at,
            input={
                "featureStage": "feature_engine",
                "mlStage": "ml_intelligence",
                "graphStage": "graph_intelligence",
                "ringStage": "ring_detection",
                "agentInputs": {
                    "behaviour": ["feature_engine", "ml_intelligence"],
                    "network": ["graph_intelligence", "ring_detection"],
                    "evidence": ["behaviour", "network", "feature_engine", "ml_intelligence", "graph_intelligence", "ring_detection"],
                },
            },
            output={"agents": agent_findings},
            evidence=[
                item
                for agent in agent_findings
                for item in agent.get("evidence", [])
            ],
        )
        db.add(agent_stage)

        assessment = RiskAssessmentService.evaluate_risk(
            ml_output=ml_result,
            ring_output=ring_candidate,
            agent_output=agent_findings,
            graph_output=graph_payload,
        )
        investigation.risk_assessment = assessment

        risk_stage = TraceStageRecord(
            trace_id=trace_id,
            index=7,
            key="risk_assessment",
            label="RISK ASSESSMENT",
            status="complete",
            duration_ms=90,
            started_at=received_at,
            completed_at=received_at,
            input={
                "mlStage": "ml_intelligence",
                "graphStage": "graph_intelligence",
                "ringStage": "ring_detection",
                "agents": [agent["agentKey"] for agent in agent_findings],
            },
            output=assessment,
            evidence=[
                {
                    "id": f"risk-{ref}",
                    "label": ref,
                    "description": assessment["explanation"],
                    "strength": assessment["riskScore"],
                    "source": "risk_assessment",
                    "timestamp": received_at,
                    "relationship": ref,
                }
                for ref in assessment.get("evidenceReferences", [])
            ],
        )
        db.add(risk_stage)
        response = ResponseService.recommend_response(
            risk_assessment=assessment,
            ring_output=ring_candidate,
            ml_output=ml_result,
            agent_output=agent_findings,
        )
        investigation.response = response
        response_stage = TraceStageRecord(
            trace_id=trace_id,
            index=8,
            key="response",
            label="RESPONSE",
            status="complete",
            duration_ms=38,
            started_at=received_at,
            completed_at=received_at,
            input={
                "riskScore": assessment["riskScore"],
                "severity": assessment["severity"],
                "sourceStages": ["risk_assessment", "ml_intelligence", "investigator_agents"] + (["ring_detection"] if ring_candidate is not None else []),
            },
            output=response,
            evidence=[
                {
                    "id": f"response-{item.lower().replace(' ', '-')}",
                    "label": item,
                    "description": response["reason"],
                    "strength": response["confidence"],
                    "source": "response",
                    "timestamp": received_at,
                    "relationship": "countermeasure",
                }
                for item in response.get("triggeringEvidence", [])
            ],
        )
        db.add(response_stage)
        countermeasure_stage = TraceStageRecord(
            trace_id=trace_id,
            index=9,
            key="countermeasure",
            label="COUNTERMEASURE",
            status="complete",
            duration_ms=38,
            started_at=received_at,
            completed_at=received_at,
            input={"riskScore": assessment["riskScore"], "severity": assessment["severity"]},
            output=response,
            evidence=response_stage.evidence,
        )
        db.add(countermeasure_stage)
        db.flush()
        report = build_report_payload(
            investigation=investigation,
            event=event,
            trace=trace,
            stages=unique_trace_stages(db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == trace_id).all()),
        )
        investigation.report = report
        report_stage = TraceStageRecord(
            trace_id=trace_id,
            index=10,
            key="report_generation",
            label="REPORT GENERATION",
            status="complete",
            duration_ms=45,
            started_at=received_at,
            completed_at=received_at,
            input={
                "eventId": event_id,
                "investigationId": investigation_id,
                "traceId": trace_id,
                "sourceStages": [stage.key for stage in unique_trace_stages(db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == trace_id).all())],
            },
            output={"reportGenerated": True, "investigationId": investigation_id},
            evidence=[],
        )
        db.add(report_stage)
        investigation.updated_at = received_at
        db.commit()

        return EventSchema(
            eventId=event_id,
            traceId=trace_id,
            investigationId=investigation_id,
            receivedAt=received_at,
            ingestionStatus="accepted",
            payload=payload_data,
        )
    finally:
        db.close()


def _format_amlsim_case(case: dict[str, Any]) -> InvestigationSchema:
    return InvestigationSchema(
        investigationId=case["investigationId"],
        eventId=case["eventId"],
        traceId=case["traceId"],
        state=case["state"],
        createdAt=case["createdAt"],
        updatedAt=case["updatedAt"],
        payload=TransactionPayload.model_validate(case["report"]["payload"]),
        trace=case["trace"],
        ring=case["ring"],
        agents=case["agents"],
        riskAssessment=case["riskAssessment"],
        response=case["response"],
        report=case["report"],
    )


@router.get("/events/{event_id}", response_model=InvestigationSchema)
def get_investigation(event_id: str) -> InvestigationSchema:
    if event_id.startswith("amlsim-"):
        tx_id = event_id.removeprefix("amlsim-event-").removeprefix("amlsim-")
        case = amlsim_service.investigate_transaction(tx_id)
        if case is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim transaction not found")
        return _format_amlsim_case(case)

    db = SessionLocal()
    try:
        event = db.query(EventRecord).filter(EventRecord.event_id == event_id).first()
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.event_id == event_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        trace = db.query(TraceRecord).filter(TraceRecord.trace_id == investigation.trace_id).first()
        if not trace:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found")

        stages = unique_trace_stages(db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == trace.trace_id).all())
        trace_payload = {
            "traceId": trace.trace_id,
            "eventId": trace.event_id,
            "investigationId": trace.investigation_id,
            "stages": [
                {
                    "index": stage.index,
                    "key": stage.key,
                    "label": stage.label,
                    "status": stage.status,
                    "durationMs": stage.duration_ms,
                    "startedAt": stage.started_at,
                    "completedAt": stage.completed_at,
                    "input": stage.input,
                    "output": stage.output,
                    "evidence": stage.evidence,
                    "traceId": stage.trace_id,
                }
                for stage in stages
            ],
            "createdAt": trace.created_at,
            "state": trace.state,
        }

        ring = investigation.ring if getattr(investigation, "ring", None) is not None else None
        agents = investigation.agents if getattr(investigation, "agents", None) is not None else None
        risk_assessment = investigation.risk_assessment if getattr(investigation, "risk_assessment", None) is not None else None
        response = investigation.response if getattr(investigation, "response", None) is not None else None
        report = investigation.report if getattr(investigation, "report", None) is not None else None
        return InvestigationSchema(
            investigationId=investigation.investigation_id,
            eventId=event.event_id,
            traceId=investigation.trace_id,
            state=investigation.state,
            createdAt=investigation.created_at,
            updatedAt=investigation.updated_at,
            payload=event.payload,
            trace=trace_payload,
            ring=ring,
            agents=agents,
            riskAssessment=risk_assessment,
            response=response,
            report=report,
        )
    finally:
        db.close()


@router.get("/traces/{trace_id}", response_model=TraceSchema)
def get_trace(trace_id: str) -> TraceSchema:
    if trace_id.startswith("trace-aml-"):
        tx_id = trace_id.removeprefix("trace-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        if case is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim trace not found")
        return TraceSchema.model_validate(case["trace"])

    db = SessionLocal()
    try:
        trace = db.query(TraceRecord).filter(TraceRecord.trace_id == trace_id).first()
        if not trace:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found")

        stages = unique_trace_stages(db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == trace.trace_id).all())
        return TraceSchema(
            traceId=trace.trace_id,
            eventId=trace.event_id,
            investigationId=trace.investigation_id,
            stages=[
                {
                    "index": stage.index,
                    "key": stage.key,
                    "label": stage.label,
                    "status": stage.status,
                    "durationMs": stage.duration_ms,
                    "startedAt": stage.started_at,
                    "completedAt": stage.completed_at,
                    "input": stage.input,
                    "output": stage.output,
                    "evidence": stage.evidence,
                    "traceId": stage.trace_id,
                }
                for stage in stages
            ],
            createdAt=trace.created_at,
            state=trace.state,
        )
    finally:
        db.close()


@router.get("/investigations/{investigation_id}", response_model=InvestigationSchema)
def get_investigation_by_id(investigation_id: str) -> InvestigationSchema:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        if case is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AMLSim investigation not found")
        return _format_amlsim_case(case)

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        event = db.query(EventRecord).filter(EventRecord.event_id == investigation.event_id).first()
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

        trace = db.query(TraceRecord).filter(TraceRecord.trace_id == investigation.trace_id).first()
        if not trace:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found")

        stages = unique_trace_stages(db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == trace.trace_id).all())
        trace_payload = {
            "traceId": trace.trace_id,
            "eventId": trace.event_id,
            "investigationId": trace.investigation_id,
            "stages": [
                {
                    "index": stage.index,
                    "key": stage.key,
                    "label": stage.label,
                    "status": stage.status,
                    "durationMs": stage.duration_ms,
                    "startedAt": stage.started_at,
                    "completedAt": stage.completed_at,
                    "input": stage.input,
                    "output": stage.output,
                    "evidence": stage.evidence,
                    "traceId": stage.trace_id,
                }
                for stage in stages
            ],
            "createdAt": trace.created_at,
            "state": trace.state,
        }

        ring = investigation.ring if getattr(investigation, "ring", None) is not None else None
        agents = investigation.agents if getattr(investigation, "agents", None) is not None else None
        risk_assessment = investigation.risk_assessment if getattr(investigation, "risk_assessment", None) is not None else None
        response = investigation.response if getattr(investigation, "response", None) is not None else None
        report = investigation.report if getattr(investigation, "report", None) is not None else None
        return InvestigationSchema(
            investigationId=investigation.investigation_id,
            eventId=event.event_id,
            traceId=investigation.trace_id,
            state=investigation.state,
            createdAt=investigation.created_at,
            updatedAt=investigation.updated_at,
            payload=event.payload,
            trace=trace_payload,
            ring=ring,
            agents=agents,
            riskAssessment=risk_assessment,
            response=response,
            report=report,
        )
    finally:
        db.close()


@router.get("/investigations/{investigation_id}/ring")
def get_ring_candidate(investigation_id: str) -> dict[str, Any]:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        if case is None or case.get("ring") is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ring candidate not found")
        return case["ring"]

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        ring = investigation.ring if getattr(investigation, "ring", None) is not None else None
        if ring is None:
            event = db.query(EventRecord).filter(EventRecord.event_id == investigation.event_id).first()
            if event is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
            events = db.query(EventRecord).filter(EventRecord.correlation_id == event.correlation_id).all()
            ring = RingService.detect_ring([{"payload": event.payload} for event in events])
            investigation.ring = ring
            db.commit()

        if ring is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ring candidate not found")
        return ring
    finally:
        db.close()


@router.get("/rings/{ring_id}")
def get_ring_by_id(ring_id: str) -> dict[str, Any]:
    if ring_id.startswith("AMLSIM-ALERT-"):
        alert_id = ring_id.removeprefix("AMLSIM-ALERT-")
        alert = amlsim_service.get_alert(alert_id)
        if alert is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert pattern not found")
        return {
            "ringId": ring_id,
            "detected": alert.get("alertType") == "cycle",
            "confidence": 75 if alert.get("alertType") == "cycle" else 40,
            "signals": [{"key": "alert_pattern", "label": f"Pattern: {alert.get('alertType')}", "weight": 0.8, "present": True}],
            "members": alert.get("accountIds", []),
            "memberCount": len(alert.get("accountIds", [])),
            "transactionVolume": alert.get("transactionCount", 0),
            "amountInvolved": sum(r.get("amount", 0.0) for r in alert.get("transactions", [])),
            "currency": "USD",
            "memberAccounts": alert.get("accountIds", []),
            "memberEvents": [r.get("transactionId") for r in alert.get("transactions", [])],
            "memberInvestigations": [],
            "transactions": [],
            "sharedDevices": [],
            "sharedIps": [],
            "sharedMerchants": [],
        }

    db = SessionLocal()
    try:
        candidate: dict[str, Any] | None = None
        candidate_correlation_id: str | None = None
        for investigation in db.query(InvestigationRecord).all():
            ring = getattr(investigation, "ring", None)
            if isinstance(ring, dict) and str(ring.get("ringId", "")) == ring_id:
                candidate = ring
                event = db.query(EventRecord).filter(EventRecord.event_id == investigation.event_id).first()
                candidate_correlation_id = event.correlation_id if event is not None else None
                break

        if candidate is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ring not found")

        member_accounts: list[str] = []
        member_events: list[str] = []
        member_investigations: list[str] = []
        transactions: list[dict[str, Any]] = []
        shared_devices: set[str] = set()
        shared_ips: set[str] = set()
        shared_merchants: set[str] = set()

        for investigation in db.query(InvestigationRecord).all():
            ring = getattr(investigation, "ring", None)
            if not isinstance(ring, dict) or str(ring.get("ringId", "")) != ring_id:
                continue

            event = db.query(EventRecord).filter(EventRecord.event_id == investigation.event_id).first()
            if event is None:
                continue
            if candidate_correlation_id is not None and event.correlation_id != candidate_correlation_id:
                continue

            payload = event.payload or {}
            sender = str(payload.get("senderAccount", "")).strip()
            receiver = str(payload.get("receiverAccount", "")).strip()
            device = str(payload.get("deviceId", "")).strip()
            ip_address = str(payload.get("ipAddress", "")).strip()
            merchant = str(payload.get("merchantId", "")).strip()

            ingestion = db.query(TraceStageRecord).filter(
                TraceStageRecord.trace_id == investigation.trace_id,
                TraceStageRecord.key == "ingestion",
            ).first()
            provenance = (ingestion.input or {}).get("provenance", {}) if ingestion is not None else {}
            source_only_relationships = provenance.get("workflow") == "fraud_target_set"
            if source_only_relationships:
                supporting_rows = {
                    int(item["sourceRowNumber"])
                    for item in candidate.get("supportingRows", [])
                    if item.get("sourceRowNumber") is not None
                }
                if int(provenance.get("sourceRowNumber", -1)) not in supporting_rows:
                    continue

            member_events.append(event.event_id)
            member_investigations.append(investigation.investigation_id)
            if sender:
                member_accounts.append(sender)
            if receiver:
                member_accounts.append(receiver)
            if device and not source_only_relationships:
                shared_devices.add(device)
            if ip_address and not source_only_relationships:
                shared_ips.add(ip_address)
            if merchant and not source_only_relationships:
                shared_merchants.add(merchant)
            transactions.append({
                "eventId": event.event_id,
                "investigationId": investigation.investigation_id,
                "traceId": investigation.trace_id,
                "payload": payload,
            })

        ordered_member_accounts = list(dict.fromkeys(item for item in member_accounts if item))
        ordered_member_events = list(dict.fromkeys(item for item in member_events if item))
        ordered_member_investigations = list(dict.fromkeys(item for item in member_investigations if item))

        return {
            "ringId": candidate.get("ringId"),
            "detected": bool(candidate.get("detected", False)),
            "confidence": int(candidate.get("confidence", 0) or 0),
            "signals": candidate.get("signals", []),
            "members": candidate.get("members", []),
            "memberCount": int(candidate.get("memberCount", len(ordered_member_accounts)) or len(ordered_member_accounts)),
            "transactionVolume": int(candidate.get("transactionVolume", len(transactions)) or len(transactions)),
            "amountInvolved": int(candidate.get("amountInvolved", 0) or 0),
            "currency": candidate.get("currency", "USD"),
            "memberAccounts": ordered_member_accounts,
            "memberEvents": ordered_member_events,
            "memberInvestigations": ordered_member_investigations,
            "transactions": transactions,
            "sharedDevices": sorted(shared_devices),
            "sharedIps": sorted(shared_ips),
            "sharedMerchants": sorted(shared_merchants),
        }
    finally:
        db.close()


@router.get("/investigations/{investigation_id}/agents")
def get_agents(investigation_id: str) -> list[dict[str, Any]]:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        return case.get("agents", [])

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        agents = investigation.agents if getattr(investigation, "agents", None) is not None else []
        if not agents:
            trace = db.query(TraceRecord).filter(TraceRecord.trace_id == investigation.trace_id).first()
            if not trace:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found")
            stages = unique_trace_stages(db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == trace.trace_id).all())
            stages_by_key = {stage.key: stage for stage in stages}
            generated = AgentService.build_agents([stage for stage in stages_by_key.values() if stage.key in {"feature_engine", "ml_intelligence", "graph_intelligence", "ring_detection"}])
            investigation.agents = generated
            db.commit()
            agents = generated
        return agents
    finally:
        db.close()


@router.get("/investigations/{investigation_id}/response")
def get_response(investigation_id: str) -> dict[str, Any]:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        return case.get("response", {})

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        response = investigation.response if getattr(investigation, "response", None) is not None else None
        if response is None:
            trace = db.query(TraceRecord).filter(TraceRecord.trace_id == investigation.trace_id).first()
            if not trace:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found")
            stages = unique_trace_stages(db.query(TraceStageRecord).filter(TraceStageRecord.trace_id == trace.trace_id).all())
            stages_by_key = {stage.key: stage for stage in stages}
            risk_assessment = investigation.risk_assessment
            if risk_assessment is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk assessment not found")
            ring = investigation.ring if getattr(investigation, "ring", None) is not None else None
            ml_output = stages_by_key.get("ml_intelligence").output if stages_by_key.get("ml_intelligence") else None
            graph_output = stages_by_key.get("graph_intelligence").output if stages_by_key.get("graph_intelligence") else None
            agent_output = (stages_by_key.get("investigator_agents").output or {}).get("agents", []) if stages_by_key.get("investigator_agents") else []
            response = ResponseService.recommend_response(
                risk_assessment=risk_assessment,
                ring_output=ring,
                ml_output=ml_output,
                agent_output=agent_output,
            )
            investigation.response = response
            if not stages_by_key.get("response"):
                db.add(TraceStageRecord(
                    trace_id=trace.trace_id,
                    index=8,
                    key="response",
                    label="RESPONSE",
                    status="complete",
                    duration_ms=38,
                    started_at=trace.created_at,
                    completed_at=trace.created_at,
                    input={"riskScore": risk_assessment.get("riskScore", 0), "severity": risk_assessment.get("severity", "LOW")},
                    output=response,
                    evidence=[],
                ))
            if not stages_by_key.get("countermeasure"):
                db.add(TraceStageRecord(
                    trace_id=trace.trace_id,
                    index=8,
                    key="countermeasure",
                    label="COUNTERMEASURE",
                    status="complete",
                    duration_ms=38,
                    started_at=trace.created_at,
                    completed_at=trace.created_at,
                    input={"riskScore": risk_assessment.get("riskScore", 0), "severity": risk_assessment.get("severity", "LOW")},
                    output=response,
                    evidence=[],
                ))
            db.commit()
        return response
    finally:
        db.close()


@router.post("/investigations/{investigation_id}/response/simulate")
def simulate_response(investigation_id: str) -> dict[str, Any]:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        resp = case.get("response", {})
        return {
            **resp,
            "status": "SIMULATED_ENFORCED",
            "simulatedAt": datetime.utcnow().isoformat() + "Z",
            "executionLog": [
                f"Simulated countermeasure executed for AMLSim Case {investigation_id}",
                f"Action taken: {resp.get('recommendedAction', 'ALERT_ONLY')}",
                "Dispatched to AML Compliance review queue"
            ]
        }

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        response = investigation.response if isinstance(investigation.response, dict) else None
        if response is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response recommendation not found")

        timestamp = datetime.utcnow().isoformat() + "Z"
        simulated_response = ResponseService.simulate_response(response, investigation_id, timestamp)
        investigation.response = simulated_response
        investigation.updated_at = timestamp

        response_stages = db.query(TraceStageRecord).filter(
            TraceStageRecord.trace_id == investigation.trace_id,
            TraceStageRecord.key.in_(["response", "countermeasure"]),
        ).all()
        for response_stage in response_stages:
            response_stage.output = simulated_response

        trace = db.query(TraceRecord).filter(TraceRecord.trace_id == investigation.trace_id).first()
        event = db.query(EventRecord).filter(EventRecord.event_id == investigation.event_id).first()
        if trace is not None and event is not None:
            report_stages = db.query(TraceStageRecord).filter(
                TraceStageRecord.trace_id == trace.trace_id,
                TraceStageRecord.key != "report_generation",
            ).order_by(TraceStageRecord.index, TraceStageRecord.id).all()
            investigation.report = build_report_payload(investigation, event, trace, report_stages)

        db.commit()
        return simulated_response
    finally:
        db.close()


@router.get("/investigations/{investigation_id}/risk")
def get_risk(investigation_id: str) -> dict[str, Any]:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        return case.get("riskAssessment", {})

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")
        risk = investigation.risk_assessment
        if risk is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk assessment not found")
        return risk
    finally:
        db.close()


@router.get("/scenarios")
def get_scenarios() -> list[dict[str, Any]]:
    return [
        {
            "id": "normal",
            "name": "Normal",
            "description": "Routine payment within an established baseline.",
            "category": "normal",
            "payload": {
                "senderAccount": "ACC-SCENARIO-01",
                "receiverAccount": "ACC-SCENARIO-02",
                "amount": 320,
                "currency": "USD",
                "deviceId": "DEV-SCENARIO-01",
                "ipAddress": "192.168.1.10",
                "location": "London, GB",
                "merchantId": "MCH-SCENARIO-01",
                "transactionType": "P2P",
                "timestamp": "2026-08-24T14:32:09Z",
            },
            "expectedOutcome": "Low risk - no ring detected",
        },
        {
            "id": "high_value",
            "name": "High Value",
            "description": "Large transfer requiring additional review.",
            "category": "suspicious",
            "payload": {
                "senderAccount": "ACC-SCENARIO-03",
                "receiverAccount": "ACC-SCENARIO-04",
                "amount": 95000,
                "currency": "USD",
                "deviceId": "DEV-SCENARIO-02",
                "ipAddress": "10.0.0.5",
                "location": "New York, US",
                "merchantId": "MCH-SCENARIO-02",
                "transactionType": "WIRE",
                "timestamp": "2026-08-24T14:32:09Z",
            },
            "expectedOutcome": "Elevated risk - review recommended",
        },
        {
            "id": "fraud_ring",
            "name": "Fraud Ring",
            "description": "Coordinated transactions with shared infrastructure.",
            "category": "malicious",
            "payload": {
                "senderAccount": "ACC-SCENARIO-RING-01",
                "receiverAccount": "ACC-SCENARIO-RING-02",
                "amount": 48200,
                "currency": "USD",
                "deviceId": "DEV-SCENARIO-RING",
                "ipAddress": "203.0.113.42",
                "location": "Frankfurt, DE",
                "merchantId": "MCH-SCENARIO-RING",
                "transactionType": "WIRE",
                "timestamp": "2026-08-24T14:32:09Z",
            },
            "expectedOutcome": "Critical risk - full investigation",
        },
    ]


@router.get("/scenarios/{scenario_id}/preview")
def preview_scenario(scenario_id: str) -> dict[str, Any]:
    scenarios = {
        item["id"]: item for item in get_scenarios()
    }
    scenario = scenarios.get(scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    mapped_payload = TransactionPayload.model_validate(scenario["payload"])
    return {
        **scenario,
        "dataset": "scenario_preset",
        "sourceRowNumber": 0,
        "sourceRow": {},
        "mappedPayload": mapped_payload.model_dump(),
        "modelFeatures": {},
        "groundTruth": {"isFraud": 0, "isFlaggedFraud": 0},
        "mapping": "Static scenario payload; no external dataset row is used.",
        "derivedContext": {},
    }


@router.post("/scenarios/{scenario_id}/investigate", response_model=EventSchema)
def investigate_scenario(scenario_id: str, request: ScenarioInvestigationRequest) -> EventSchema:
    scenario = next((item for item in get_scenarios() if item["id"] == scenario_id), None)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    return _process_transaction(
        TransactionPayload.model_validate(scenario["payload"]),
        request.previewToken,
        replay_metadata={"workflow": "preset", "source": "scenario_preset", "dataset": "scenario_preset", "sourceRowNumber": 0},
    )


def _get_runtime_mode() -> str:
    value = os.getenv("RINGBREAK_ML_MODE", "LIVE").strip().upper()
    if value == "DEMO":
        return "DEMO"
    return "LIVE"


@router.get("/system/status")
def get_system_status() -> dict[str, Any]:
    ml_mode = _get_runtime_mode()
    return {
        "mode": ml_mode,
        "mlModel": LIVE_MODEL_NAME if ml_mode == "LIVE" else MODEL_NAME,
        "backendReachable": True,
        "version": "0.1.0",
        "uptimeLabel": "ONLINE",
    }


@router.get("/investigations/{investigation_id}/report")
def get_report(investigation_id: str) -> dict[str, Any]:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        return case.get("report", {})

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        event = db.query(EventRecord).filter(EventRecord.event_id == investigation.event_id).first()
        trace = db.query(TraceRecord).filter(TraceRecord.trace_id == investigation.trace_id).first()
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        if not trace:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found")

        report = investigation.report if getattr(investigation, "report", None) is not None else None
        if report is None:
            stages = unique_trace_stages(db.query(TraceStageRecord).filter(
                TraceStageRecord.trace_id == trace.trace_id,
                TraceStageRecord.key != "report_generation",
            ).all())
            report = build_report_payload(investigation, event, trace, stages)
            investigation.report = report
            if not db.query(TraceStageRecord).filter(
                TraceStageRecord.trace_id == trace.trace_id,
                TraceStageRecord.key == "report_generation",
            ).first():
                db.add(TraceStageRecord(
                    trace_id=trace.trace_id,
                    index=9,
                    key="report_generation",
                    label="REPORT GENERATION",
                    status="complete",
                    duration_ms=45,
                    started_at=trace.created_at,
                    completed_at=trace.created_at,
                    input={"investigationId": investigation_id, "stageCount": len(stages)},
                    output={"reportGenerated": True, "investigationId": investigation_id},
                    evidence=[],
                ))
            db.commit()
        return report
    finally:
        db.close()


@router.get("/investigations/{investigation_id}/network")
def get_network_graph(investigation_id: str) -> dict[str, Any]:
    if investigation_id.startswith("inv-aml-"):
        tx_id = investigation_id.removeprefix("inv-aml-")
        case = amlsim_service.investigate_transaction(tx_id)
        return case.get("networkGraph", {"nodes": [], "links": []})

    db = SessionLocal()
    try:
        investigation = db.query(InvestigationRecord).filter(InvestigationRecord.investigation_id == investigation_id).first()
        if not investigation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investigation not found")

        event = db.query(EventRecord).filter(EventRecord.event_id == investigation.event_id).first()
        if event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        ingestion = db.query(TraceStageRecord).filter(
            TraceStageRecord.trace_id == investigation.trace_id,
            TraceStageRecord.key == "ingestion",
        ).first()
        provenance = (ingestion.input or {}).get("provenance", {}) if ingestion is not None else {}
        if provenance.get("workflow") == "fraud_target_set":
            graph_stage = db.query(TraceStageRecord).filter(
                TraceStageRecord.trace_id == investigation.trace_id,
                TraceStageRecord.key == "graph_intelligence",
            ).first()
            if graph_stage is not None and isinstance(graph_stage.output, dict):
                return graph_stage.output
        events = db.query(EventRecord).filter(EventRecord.correlation_id == event.correlation_id).all()
        graph_payload = GraphService.build_network_graph_from_events([{"payload": event.payload} for event in events])
        return graph_payload
    finally:
        db.close()


def generate_password_protected_pdf(report_data: dict[str, Any]) -> bytes:
    import io
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from pypdf import PdfReader, PdfWriter

    trace_id = str(report_data.get("traceId") or report_data.get("trace_id") or "TRC-DEFAULT")
    inv_id = str(report_data.get("investigationId") or report_data.get("investigation_id") or "INV-REPORT")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748b'),
    )
    heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
    )

    elements = []
    elements.append(Paragraph("RING//BREAK FORENSIC INVESTIGATION REPORT", title_style))
    elements.append(Paragraph(f"Protected Document &bull; Generated: {report_data.get('generatedAt', datetime.utcnow().isoformat())}", subtitle_style))
    elements.append(Spacer(1, 12))

    evt_id = str(report_data.get("eventId") or report_data.get("event_id") or "N/A")
    summary_data = [
        [Paragraph("<b>Investigation ID:</b>", body_style), Paragraph(inv_id, body_style),
         Paragraph("<b>Event ID:</b>", body_style), Paragraph(evt_id, body_style)],
        [Paragraph("<b>Trace ID:</b>", body_style), Paragraph(trace_id, body_style),
         Paragraph("<b>Security Status:</b>", body_style), Paragraph("<b>ENCRYPTED (TRACE ID PASSWORD)</b>", body_style)]
    ]
    t = Table(summary_data, colWidths=[110, 150, 100, 180])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 12))

    risk = report_data.get("risk") or {}
    if isinstance(risk, dict):
        elements.append(Paragraph("1. Risk Assessment", heading_style))
        risk_score = str(risk.get("score", 0))
        risk_level = str(risk.get("level", "LOW"))
        fraud_prob_raw = risk.get("fraudProbability")
        fraud_prob = f"{float(fraud_prob_raw)*100:.1f}%" if fraud_prob_raw is not None else "N/A"

        risk_table_data = [
            [Paragraph("<b>Risk Score:</b>", body_style), Paragraph(f"{risk_score}/100", body_style),
             Paragraph("<b>Risk Level:</b>", body_style), Paragraph(f"<b>{risk_level}</b>", body_style),
             Paragraph("<b>Fraud Probability:</b>", body_style), Paragraph(fraud_prob, body_style)]
        ]
        t_risk = Table(risk_table_data, colWidths=[80, 80, 80, 80, 110, 110])
        t_risk.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f1f5f9')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(t_risk)
        elements.append(Spacer(1, 10))

        if risk.get("explanation"):
            elements.append(Paragraph(f"<b>Risk Summary:</b> {risk.get('explanation')}", body_style))
            elements.append(Spacer(1, 10))

    payload = report_data.get("payload") or {}
    if isinstance(payload, dict) and payload:
        elements.append(Paragraph("2. Transaction Payload", heading_style))
        tx_data = [
            [Paragraph("<b>Sender:</b>", body_style), Paragraph(str(payload.get("senderAccount", "")), body_style),
             Paragraph("<b>Receiver:</b>", body_style), Paragraph(str(payload.get("receiverAccount", "")), body_style)],
            [Paragraph("<b>Amount:</b>", body_style), Paragraph(f"${payload.get('amount', 0):,} {payload.get('currency', 'USD')}", body_style),
             Paragraph("<b>Type:</b>", body_style), Paragraph(str(payload.get("transactionType", "")), body_style)],
            [Paragraph("<b>Device ID:</b>", body_style), Paragraph(str(payload.get("deviceId", "")), body_style),
             Paragraph("<b>IP Address:</b>", body_style), Paragraph(str(payload.get("ipAddress", "")), body_style)]
        ]
        t_tx = Table(tx_data, colWidths=[90, 170, 90, 190])
        t_tx.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#ffffff')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#f1f5f9')),
            ('PADDING', (0,0), (-1,-1), 5),
        ]))
        elements.append(t_tx)
        elements.append(Spacer(1, 10))

    ring = report_data.get("ring")
    if isinstance(ring, dict) and ring.get("detected"):
        elements.append(Paragraph("3. Detected Fraud Ring Details", heading_style))
        ring_text = f"<b>Ring ID:</b> {ring.get('ringId')} &nbsp;|&nbsp; <b>Confidence:</b> {ring.get('confidence')}% &nbsp;|&nbsp; <b>Members:</b> {ring.get('memberCount')} &nbsp;|&nbsp; <b>Volume:</b> ${ring.get('amountInvolved',0):,}"
        elements.append(Paragraph(ring_text, body_style))
        elements.append(Spacer(1, 10))

    if report_data.get("conclusion"):
        elements.append(Paragraph("4. Executive Conclusion", heading_style))
        elements.append(Paragraph(str(report_data.get("conclusion")), body_style))

    doc.build(elements)
    raw_pdf = buffer.getvalue()

    # Encrypt raw PDF using PyPDF with user_password = trace_id
    reader = PdfReader(io.BytesIO(raw_pdf))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    writer.encrypt(user_password=trace_id)

    encrypted_buffer = io.BytesIO()
    writer.write(encrypted_buffer)
    return encrypted_buffer.getvalue()


@router.post("/export-protected-pdf")
def export_protected_pdf(report_data: dict[str, Any]) -> Response:
    try:
        pdf_bytes = generate_password_protected_pdf(report_data)
        inv_id = str(report_data.get("investigationId") or report_data.get("investigation_id") or "report")
        filename = f"RINGBREAK-Protected-Report-{inv_id}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate protected PDF: {str(e)}")

