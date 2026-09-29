# RING//BREAK backend

Minimal FastAPI backend for the locked frontend contract.

## Quick start

python -m venv .venv
. .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

## Endpoints

- GET /health
- POST /transactions/inject
- GET /events/{event_id}
- GET /traces/{trace_id}
