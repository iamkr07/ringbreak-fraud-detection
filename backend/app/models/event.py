from __future__ import annotations

from sqlalchemy import JSON, Column, String

from app.database import Base


class EventRecord(Base):
    __tablename__ = "events"

    event_id = Column(String, primary_key=True, index=True)
    trace_id = Column(String, nullable=False, index=True)
    investigation_id = Column(String, nullable=False, index=True)
    correlation_id = Column(String, nullable=False, index=True)
    received_at = Column(String, nullable=False)
    ingestion_status = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)
