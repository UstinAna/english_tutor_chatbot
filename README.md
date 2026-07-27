# 🎙️ AI English Tutor Chatbot

A conversational English tutor. You chat with **Maya**, an AI tutor, and she
replies naturally while gently flagging grammar or phrasing mistakes as
"margin notes" next to what you wrote — like a teacher annotating an essay,
without breaking the flow of conversation.

Maya can run on **either Claude (Anthropic) or a Hugging Face-hosted open
model** — pick one with a single setting in `.env`, no code changes needed.

Speech input (mic) and text-to-speech replies are supported via the browser's
built-in speech APIs — no extra services or cost.

## How it works

```
Browser (HTML/JS + Web Speech API)  →  FastAPI backend  →  Claude  or  Hugging Face
        ↑______________________________________|         (LLM_PROVIDER in .env)
        JSON: { reply, corrections[] }
```

- The frontend is plain HTML/CSS/JS — no build step required.
- The backend is a small FastAPI app with one real endpoint, `/api/chat`,
  that keeps a short in-memory conversation history per session and asks
  the selected LLM for a structured JSON reply (conversational text + a
  list of corrections). `tutor.py` picks the provider based on
  `LLM_PROVIDER` and only initializes that one client.
- FastAPI also serves the frontend directly, so the whole app runs from a
  single process.
- Speech-to-text (mic button) and text-to-speech ("🔊 Speak replies" toggle)
  run entirely in the browser via the Web Speech API — no backend involved,
  no extra API key needed. Currently best supported in Chrome/Edge.

## Setup

**1. Choose a provider and get credentials for it:**

| `LLM_PROVIDER` value | Get credentials at | Notes |
|---|---|---|
| `anthropic` (default) | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Needs billing/credit set up on the account. More reliable JSON output. |
| `huggingface` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | Free tier available. **Create a "Custom" token and check only "Inference → Make calls to Inference Providers."** A plain Read-Only token is *not* sufficient — it authenticates fine but gets a 403 when actually calling inference. Smaller models are also less consistent at following the JSON format — see notes below. |

**2. Install dependencies:**

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**3. Configure `.env`:**

```bash
cp .env.example .env
```

Then edit `.env`:
- Set `LLM_PROVIDER` to `anthropic` or `huggingface`.
- Fill in the API key/token for whichever one you picked (the other block
  can stay as placeholder text — it's ignored).

⚠️ Never commit `.env` or paste a real key/token into chat, a terminal
command, or a commit message — treat it like a password. If one ever leaks,
revoke it immediately and generate a new one.

**4. Run it:**

```bash
uvicorn main:app --reload
```

Open **http://127.0.0.1:8000** in your browser.

## Troubleshooting

- **`invalid x-api-key` (Anthropic)** — your `.env` still has the placeholder
  text instead of a real key, or you're running uvicorn from the repo root
  instead of `backend/` (so `.env` never gets picked up).
- **`TypeError: Client.__init__() got an unexpected keyword argument 'proxies'`**
  — version mismatch between `anthropic` and `httpx` in your Python
  environment (common in shared/conda environments). Fix: `pip install -U anthropic`.
- **`NameResolutionError` / can't resolve `api-inference.huggingface.co`**
  — this endpoint is deprecated. Make sure `huggingface_hub>=0.30.0` is
  installed (`pip install -U huggingface_hub`) so the client routes through
  the current Inference Providers system instead.
- **`403 Forbidden: ... does not have sufficient permissions to call
  Inference Providers`** — your HF token exists and authenticates, but
  wasn't scoped for inference. Generate a new **Custom** token with
  **"Make calls to Inference Providers"** checked (see the setup table
  above) — Read-Only tokens don't include this by default.
- **`TypeError: InferenceClient.__init__() got an unexpected keyword
  argument 'provider'`** after upgrading `huggingface_hub` — a stale
  `uvicorn --reload` process is still running with the old library loaded
  in memory. Kill it (`pkill -f uvicorn`, check `lsof -i :8000`) and start
  fresh.
- **`Could not import module "main"`** — you're running `uvicorn main:app`
  from the wrong folder. It must be run from inside `backend/`, not the
  repo root.
- **Response hangs on "Maya is typing…" for a long time** — free-tier
  Inference Providers can have real cold-start delay (tens of seconds) the
  first time a lightly-used model gets a request. Check your backend
  terminal for errors before assuming it's stuck.

## Project structure

```
english_tutor_chatbot/
├── backend/
│   ├── main.py          # FastAPI app + routes, serves the frontend
│   ├── tutor.py         # System prompt, session memory, provider dispatch (Claude/HF)
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
- **Provider/model choice**: switch providers anytime via `LLM_PROVIDER` in
  `.env` — no code changes needed. Override the specific model with
  `ANTHROPIC_MODEL` (default `claude-sonnet-5`) or `HF_MODEL` (default
  `Qwen/Qwen2.5-7B-Instruct`). Not every model on the Hub is available via
  Inference Providers — check a model's page on huggingface.co for an
  "Inference Providers" widget before setting `HF_MODEL` to it. Free-tier
  availability and rate limits change over time, so if the default HF model
  gives errors or is unavailable, try another instruct model from that list.
- **JSON reliability**: smaller open models (typical on HF's free tier)
  follow the "reply as strict JSON" instruction less consistently than
  Claude does. `tutor.py` has a fallback that shows the raw reply as plain
  text (no corrections) if JSON parsing fails — you may see this happen
  occasionally with `huggingface` as the provider.

## Roadmap

- [x] Speech-to-text input (browser Web Speech API)
- [x] Text-to-speech replies (browser speechSynthesis)
- [ ] Vocabulary tracking across sessions
- [ ] Difficulty/level selector