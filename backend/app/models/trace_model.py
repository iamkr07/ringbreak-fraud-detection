from __future__ import annotations

from sqlalchemy import JSON, Column, Integer, String

from app.database import Base


class TraceRecord(Base):
    __tablename__ = "traces"

    trace_id = Column(String, primary_key=True, index=True)
    event_id = Column(String, nullable=False, index=True)
    investigation_id = Column(String, nullable=False, index=True)
    created_at = Column(String, nullable=False)
    state = Column(String, nullable=False)


class TraceStageRecord(Base):
    __tablename__ = "trace_stages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    trace_id = Column(String, nullable=False, index=True)
    index = Column(Integer, nullable=False)
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    status = Column(String, nullable=False)
    duration_ms = Column(Integer, nullable=False)
    started_at = Column(String, nullable=False)
    completed_at = Column(String, nullable=True)
    input = Column(JSON, nullable=False)
    output = Column(JSON, nullable=False)
    evidence = Column(JSON, nullable=False, default=list)
