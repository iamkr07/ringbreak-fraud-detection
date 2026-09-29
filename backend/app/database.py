from __future__ import annotations

import sqlite3
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_PATH = BASE_DIR / "ringbreak.db"


def _configured_database_path() -> Path:
    configured_url = os.getenv("DATABASE_URL", "").strip()
    configured_path = os.getenv("RINGBREAK_DATABASE_PATH", "").strip()
    if configured_path:
        return Path(configured_path).expanduser().resolve()
    if configured_url.startswith("sqlite:///"):
        return Path(configured_url.removeprefix("sqlite:///")).expanduser().resolve()
    return DEFAULT_DATABASE_PATH


DATABASE_PATH = _configured_database_path()
DATABASE_URL = (
    f"sqlite:///{DATABASE_PATH.as_posix()}"
    if os.getenv("RINGBREAK_DATABASE_PATH", "").strip()
    else os.getenv("DATABASE_URL", "").strip() or f"sqlite:///{DATABASE_PATH.as_posix()}"
)


class Base(DeclarativeBase):
    pass


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def init_db() -> None:
    import app.models.event  # noqa: F401
    import app.models.feature  # noqa: F401
    import app.models.investigation  # noqa: F401
    import app.models.trace_model  # noqa: F401

    Base.metadata.create_all(bind=engine)

    with sqlite3.connect(DATABASE_PATH) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if "investigations" not in tables:
            return

        investigations = conn.execute("PRAGMA table_info(investigations)").fetchall()
        existing_columns = {column[1] for column in investigations}

        events = conn.execute("PRAGMA table_info(events)").fetchall()
        event_columns = {column[1] for column in events}
        if "correlation_id" not in event_columns:
            conn.execute("ALTER TABLE events ADD COLUMN correlation_id VARCHAR")
            conn.execute("UPDATE events SET correlation_id = investigation_id WHERE correlation_id IS NULL")

        for column_name, column_type in (("ring", "JSON"), ("agents", "JSON"), ("risk_assessment", "JSON"), ("response", "JSON"), ("report", "JSON")):
            if column_name in existing_columns:
                continue
            try:
                conn.execute(f"ALTER TABLE investigations ADD COLUMN {column_name} {column_type}")
            except sqlite3.OperationalError as exc:
                message = str(exc).lower()
                if "duplicate column" not in message and "already exists" not in message:
                    raise

        conn.execute("UPDATE investigations SET agents = '[]' WHERE agents IS NULL")
        conn.execute("UPDATE investigations SET risk_assessment = NULL WHERE risk_assessment IS NULL")
        conn.commit()


def reset_db() -> None:
    import tempfile
    is_temp_db = str(DATABASE_PATH).lower().startswith(tempfile.gettempdir().lower())
    allow_reset = os.getenv("ALLOW_DATABASE_RESET", "").strip().lower() in ("1", "true")
    if not is_temp_db and not allow_reset:
        raise RuntimeError(
            f"SAFETY LOCK: reset_db() called on persistent database '{DATABASE_PATH}'. "
            "Set ALLOW_DATABASE_RESET=true or use a temp database to proceed."
        )

    try:
        SessionLocal.close_all()
    except Exception:
        pass
    try:
        engine.dispose()
    except Exception:
        pass

    with sqlite3.connect(DATABASE_PATH) as conn:
        tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
        for table in reversed(tables):
            conn.execute(f'DROP TABLE IF EXISTS "{table}"')
        conn.commit()

    init_db()
