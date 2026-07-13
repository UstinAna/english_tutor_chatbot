"""
FastAPI backend for the English Tutor chatbot.

Run with:
    uvicorn main:app --reload

Serves the JSON API at /api/* and the static frontend (../frontend) at /.
"""

import os
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from tutor import get_reply, reset_session

app = FastAPI(title="English Tutor Chatbot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before deploying publicly
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    corrections: list[dict]


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    session_id = req.session_id or str(uuid.uuid4())

    try:
        result = get_reply(session_id, req.message.strip())
    except Exception as exc:  # surface a clean error instead of a 500 traceback
        raise HTTPException(status_code=502, detail=f"Tutor is unavailable: {exc}")

    return ChatResponse(
        session_id=session_id,
        reply=result["reply"],
        corrections=result["corrections"],
    )


@app.post("/api/reset/{session_id}")
def reset(session_id: str):
    reset_session(session_id)
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve the frontend as static files at the root path.
_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(_frontend_dir):
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
