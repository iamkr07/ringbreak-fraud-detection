from __future__ import annotations

from math import isfinite
from typing import Literal

from pydantic import BaseModel, Field, field_validator # type: ignore

Currency = str
TransactionType = str


class TransactionPayload(BaseModel):
    senderAccount: str = Field(..., min_length=1)
    receiverAccount: str = Field(..., min_length=1)
    amount: float = Field(..., ge=0)
    currency: Currency = Field(default="USD")
    deviceId: str | None = Field(default=None)
    ipAddress: str | None = Field(default=None)
    location: str | None = Field(default=None)
    merchantId: str | None = Field(default=None)
    transactionType: TransactionType = Field(default="TRANSFER")
    timestamp: str = Field(..., min_length=1)

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: str) -> str:
        value_str = str(value).strip()
        if value_str.lower().startswith("step") or value_str.isdigit():
            return value_str
        from datetime import datetime

        try:
            datetime.fromisoformat(value_str.replace("Z", "+00:00"))
        except ValueError:
            return value_str
        return value_str

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("amount must be a finite number")
        return value

    model_config = {"extra": "ignore"}


class ScenarioInvestigationRequest(BaseModel):
    previewToken: str | None = None
