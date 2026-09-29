from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class TraceStageSchema(BaseModel):
    index: int
    key: str
    label: str
    status: str
    durationMs: int
    startedAt: str
    completedAt: str | None
    input: dict[str, Any]
    output: dict[str, Any]
    evidence: list[dict[str, Any]]
    traceId: str


class TraceSchema(BaseModel):
    traceId: str
    eventId: str
    investigationId: str
    stages: list[TraceStageSchema]
    createdAt: str
    state: str

    model_config = {"extra": "forbid"}
