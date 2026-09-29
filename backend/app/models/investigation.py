from __future__ import annotations

from sqlalchemy import JSON, Column, String

from app.database import Base


class InvestigationRecord(Base):
    __tablename__ = "investigations"

    investigation_id = Column(String, primary_key=True, index=True)
    event_id = Column(String, nullable=False, index=True)
    trace_id = Column(String, nullable=False, index=True)
    state = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)
    ring = Column(JSON, nullable=True, default=None)
    agents = Column(JSON, nullable=True, default=list)
    risk_assessment = Column(JSON, nullable=True, default=None)
    response = Column(JSON, nullable=True, default=None)
    report = Column(JSON, nullable=True, default=None)
