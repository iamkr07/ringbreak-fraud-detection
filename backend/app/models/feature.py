from __future__ import annotations

from sqlalchemy import JSON, Column, String

from app.database import Base


class FeatureRecord(Base):
    __tablename__ = "features"

    feature_id = Column(String, primary_key=True, index=True)
    event_id = Column(String, nullable=False, index=True)
    trace_id = Column(String, nullable=False, index=True)
    created_at = Column(String, nullable=False)
    features = Column(JSON, nullable=False)
