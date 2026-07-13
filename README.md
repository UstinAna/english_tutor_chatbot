# 🎙️ AI English Tutor Chatbot

A text-based conversational English tutor. You chat with **Maya**, an AI tutor
powered by Claude, and she replies naturally while gently flagging grammar or
phrasing mistakes as "margin notes" next to what you wrote — like a teacher
annotating an essay, without breaking the flow of conversation.

Voice input/output is planned as a later phase; this version is text-only.

## How it works

```
Browser (static HTML/JS)  →  FastAPI backend  →  Claude (Anthropic API)
        ↑__________________________|
        JSON: { reply, corrections[] }
```

- The frontend is plain HTML/CSS/JS — no build step required.
- The backend is a small FastAPI app with one real endpoint, `/api/chat`,
  that keeps a short in-memory conversation history per session and asks
  Claude for a structured JSON reply (conversational text + a list of
  corrections).
- FastAPI also serves the frontend directly, so the whole app runs from a
  single process.

## Setup

**1. Get an Anthropic API key** from [console.anthropic.com](https://console.anthropic.com).

**2. Install dependencies:**

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**3. Add your API key:**

```bash
cp .env.example .env
# then edit .env and paste your key in place of the placeholder
```

**4. Run it:**

```bash
uvicorn main:app --reload
```

Open **http://127.0.0.1:8000** in your browser.

## Project structure

```
english_tutor_chatbot/
├── backend/
│   ├── main.py          # FastAPI app + routes, serves the frontend
│   ├── tutor.py         # System prompt, session memory, Claude calls
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

## API

`POST /api/chat`

```json
// request
{ "session_id": "optional-existing-id", "message": "I go to store yesterday." }

// response
{
  "session_id": "generated-or-echoed-id",
  "reply": "Sounds fun — what did you get there?",
  "corrections": [
    {
      "original": "I go to store yesterday",
      "corrected": "I went to the store yesterday",
      "explanation": "Use past tense 'went' for a completed action, and 'the store' needs an article."
    }
  ]
}
```

`POST /api/reset/{session_id}` — clears that session's memory.

## Notes on scaling this up

- **Session storage is in-memory** (a plain Python dict). It resets when the
  server restarts and won't work across multiple worker processes. Swap it
  for Redis or a database before deploying for real users — see the note at
  the top of `tutor.py`.
- **CORS is wide open** (`allow_origins=["*"]`) for local development.
  Restrict it before deploying publicly.
- **Model choice**: defaults to `claude-sonnet-5`. For lower cost/latency
  during development, set `CLAUDE_MODEL=claude-haiku-4-5-20251001` in `.env`.

## Roadmap

- [ ] Speech-to-text input (Whisper or browser Web Speech API)
- [ ] Text-to-speech replies
- [ ] Vocabulary tracking across sessions
- [ ] Difficulty/level selector
