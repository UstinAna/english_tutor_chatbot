"""
Core tutoring logic.

Keeps a short-term, in-memory conversation history per session and calls
Claude with a system prompt that asks for a structured reply: a
conversational response plus a list of gentle corrections on what the
learner wrote. This is what powers the "margin note" corrections in the UI.

In-memory storage is fine for local dev / a single-process demo. Swap
SESSIONS for Redis or a DB before running this with multiple workers or
in production.
"""

import json
import os
import re
from typing import TypedDict

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")
MAX_HISTORY_TURNS = 12  # user+assistant pairs kept per session before trimming

client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment

SYSTEM_PROMPT = """You are Maya, a warm and encouraging English conversation tutor.
You chat naturally with the learner about whatever they bring up, and you help them
improve their English along the way.

Rules:
- Keep the conversation going. Ask a genuine follow-up question most turns.
- Match your vocabulary and sentence complexity to the learner's apparent level.
- Notice grammar, word choice, or phrasing mistakes in the learner's LAST message only.
  Do not correct earlier messages again.
- Only flag mistakes that would sound wrong to a native speaker. Do not nitpick
  minor stylistic variation or things that are already correct.
- Keep explanations short (one sentence), plain, and kind. Never scold.
- If there are no mistakes, return an empty corrections list. Do not invent one.

You must respond with ONLY a single JSON object, no markdown fences, no prose
outside the JSON, matching exactly this shape:

{
  "reply": "your conversational reply to the learner, as plain text",
  "corrections": [
    {"original": "the exact phrase the learner wrote", "corrected": "the fixed phrase", "explanation": "short reason"}
  ]
}
"""


class Correction(TypedDict):
    original: str
    corrected: str
    explanation: str


class TutorReply(TypedDict):
    reply: str
    corrections: list[Correction]


# session_id -> list of {"role": "user"|"assistant", "content": str}
SESSIONS: dict[str, list[dict]] = {}


def _extract_json(raw: str) -> dict:
    """Best-effort JSON extraction in case the model wraps output in fences
    or adds stray text despite instructions."""
    raw = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1)
    else:
        brace = re.search(r"\{.*\}", raw, re.DOTALL)
        if brace:
            raw = brace.group(0)
    return json.loads(raw)


def get_reply(session_id: str, user_message: str) -> TutorReply:
    history = SESSIONS.setdefault(session_id, [])
    history.append({"role": "user", "content": user_message})

    # Keep the payload bounded so the request doesn't grow forever.
    trimmed = history[-(MAX_HISTORY_TURNS * 2):]

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=trimmed,
    )

    raw_text = "".join(
        block.text for block in response.content if block.type == "text"
    )

    try:
        parsed = _extract_json(raw_text)
        reply_text = parsed.get("reply", "").strip()
        corrections = parsed.get("corrections", []) or []
    except (json.JSONDecodeError, AttributeError):
        # Fall back to showing the raw text so a parsing hiccup never
        # produces a silent failure for the learner.
        reply_text = raw_text.strip()
        corrections = []

    history.append({"role": "assistant", "content": raw_text})

    return {"reply": reply_text, "corrections": corrections}


def reset_session(session_id: str) -> None:
    SESSIONS.pop(session_id, None)
