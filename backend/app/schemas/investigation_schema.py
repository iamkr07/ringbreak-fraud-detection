from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.schemas.payload import TransactionPayload


class InvestigationSchema(BaseModel):
    investigationId: str
    eventId: str
    traceId: str
    state: str
    createdAt: str
    updatedAt: str
    payload: TransactionPayload
    trace: dict[str, Any]
    ring: dict[str, Any] | None = None
    agents: list[dict[str, Any]] | None = None
    riskAssessment: dict[str, Any] | None = None
    response: dict[str, Any] | None = None
    report: dict[str, Any] | None = None

    model_config = {"extra": "forbid"}
