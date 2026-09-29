from __future__ import annotations

from pydantic import BaseModel

from app.schemas.payload import TransactionPayload


class EventSchema(BaseModel):
    eventId: str
    traceId: str
    investigationId: str
    receivedAt: str
    ingestionStatus: str
    payload: TransactionPayload

    model_config = {"extra": "forbid"}
