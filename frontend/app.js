const API_BASE = ""; // same-origin, since FastAPI serves this frontend too

const notebook = document.getElementById("notebook");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const resetBtn = document.getElementById("reset-btn");
const micBtn = document.getElementById("mic-btn");
const speakToggle = document.getElementById("speak-toggle");

// ---------- Text-to-speech (browser speechSynthesis) ----------
const canSpeak = "speechSynthesis" in window;
if (!canSpeak) {
  speakToggle.disabled = true;
  speakToggle.closest(".voice-toggle").title = "Text-to-speech isn't supported in this browser";
}

// Long single utterances are unreliable across browsers/engines — some
// stall or cut off after ~15s (a long-standing Chrome bug), and the
// pause()/resume() nudge that fixes it for Chrome's native voices doesn't
// help when speech is routed through a system engine like speech-dispatcher
// on Linux. Splitting the reply into sentence-sized chunks and speaking
// them as a queue of short utterances avoids the problem almost entirely,
// since each individual utterance finishes well before any timeout.
let speechQueue = [];

function splitIntoChunks(text) {
  // Split on sentence-ending punctuation, keep the punctuation attached.
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.map((s) => s.trim()).filter(Boolean);
}

function speakNextInQueue() {
  if (speechQueue.length === 0) return;
  const chunk = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(chunk);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.onend = speakNextInQueue;
  utterance.onerror = speakNextInQueue;
  window.speechSynthesis.speak(utterance);
}

function speak(text) {
  if (!canSpeak || !speakToggle.checked || !text) return;
  window.speechSynthesis.cancel(); // stop anything currently playing/queued
  speechQueue = splitIntoChunks(text);
  speakNextInQueue();
}

function stopSpeaking() {
  speechQueue = [];
  if (canSpeak) window.speechSynthesis.cancel();
}

let sessionId = localStorage.getItem("tutor_session_id") || null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function addUserBubble(text) {
  const row = document.createElement("div");
  row.className = "bubble-row user";
  row.innerHTML = `
    <span class="speaker-label">You</span>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  notebook.appendChild(row);
  return row;
}

function addMarginNote(corrections) {
  if (!corrections || corrections.length === 0) return;
  const note = document.createElement("div");
  note.className = "margin-note";
  const lines = corrections
    .map(
      (c) => `
      <div class="correction-line">
        <span class="original">${escapeHtml(c.original)}</span> →
        <span class="corrected">${escapeHtml(c.corrected)}</span>
        <span class="explanation">${escapeHtml(c.explanation || "")}</span>
      </div>`
    )
    .join("");
  note.innerHTML = `<div class="note-title">Maya's notes</div>${lines}`;
  notebook.appendChild(note);
}

function addAssistantBubble(text) {
  const row = document.createElement("div");
  row.className = "bubble-row assistant";
  row.innerHTML = `
    <span class="speaker-label">Maya</span>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  notebook.appendChild(row);
  return row;
}

function addTypingIndicator() {
  const el = document.createElement("div");
  el.className = "typing";
  el.id = "typing-indicator";
  el.textContent = "Maya is typing…";
  notebook.appendChild(el);
  scrollToBottom();
  return el;
}

function removeTypingIndicator() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

function scrollToBottom() {
  notebook.scrollTop = notebook.scrollHeight;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  stopListening();
  input.value = "";
  input.style.height = "auto";
  sendBtn.disabled = true;

  addUserBubble(text);
  scrollToBottom();
  addTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }

    const data = await res.json();
    sessionId = data.session_id;
    localStorage.setItem("tutor_session_id", sessionId);

    removeTypingIndicator();
    addMarginNote(data.corrections);
    addAssistantBubble(data.reply);
    scrollToBottom();
    speak(data.reply);
  } catch (err) {
    removeTypingIndicator();
    const errorRow = document.createElement("div");
    errorRow.className = "entry system-entry";
    errorRow.innerHTML = `<p>Something went wrong: ${escapeHtml(err.message)}. Check that the backend is running and your API key is set.</p>`;
    notebook.appendChild(errorRow);
    scrollToBottom();
  } finally {
    sendBtn.disabled = false;
  }
}

async function resetConversation() {
  stopSpeaking();
  if (sessionId) {
    fetch(`${API_BASE}/api/reset/${sessionId}`, { method: "POST" }).catch(() => {});
  }
  localStorage.removeItem("tutor_session_id");
  sessionId = null;
  notebook.innerHTML = `
    <div class="entry system-entry">
      <p>New session started. Say anything — Maya will reply and note anything worth fixing in the margin.</p>
    </div>
  `;
}

// ---------- Speech-to-text (Web Speech API) ----------
// Supported in Chrome/Edge (webkitSpeechRecognition). Not supported in
// Firefox or Safari as of this writing — the mic button is disabled there
// with an explanatory title instead of failing silently.
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;
let micBaseText = ""; // whatever was already in the box before this listening session started

if (SpeechRecognitionAPI) {
  recognizer = new SpeechRecognitionAPI();
  recognizer.lang = "en-US";
  recognizer.continuous = true; // keep listening until the mic button is clicked again
  recognizer.interimResults = true;

  recognizer.onresult = (event) => {
    if (!isListening) return; // ignore late results that arrive after stop()
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = micBaseText + transcript;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  };

  recognizer.onend = () => {
    if (isListening) {
      // Chrome sometimes stops recognition on its own after a long silence
      // even in continuous mode. If the user hasn't clicked the mic to stop,
      // just restart it transparently.
      try {
        recognizer.start();
        return;
      } catch (e) {
        // fall through to actually stopping if restart isn't possible
      }
    }
    isListening = false;
    micBtn.classList.remove("listening");
  };

  recognizer.onerror = (event) => {
    isListening = false;
    micBtn.classList.remove("listening");
    if (event.error !== "no-speech" && event.error !== "aborted") {
      console.error("Speech recognition error:", event.error);
    }
  };
} else {
  micBtn.disabled = true;
  micBtn.title = "Speech-to-text isn't supported in this browser (try Chrome or Edge)";
}

function stopListening() {
  if (recognizer && isListening) {
    isListening = false; // set before .stop() so onend doesn't try to auto-restart
    recognizer.stop();
    micBtn.classList.remove("listening");
  }
}

function toggleListening() {
  if (!recognizer) return;
  if (isListening) {
    recognizer.stop();
    isListening = false;
    micBtn.classList.remove("listening");
  } else {
    // Keep whatever's already typed and add a space before the new speech,
    // instead of wiping the box out.
    micBaseText = input.value.trim() ? input.value.trim() + " " : "";
    recognizer.start();
    isListening = true;
    micBtn.classList.add("listening");
  }
}

micBtn.addEventListener("click", toggleListening);

sendBtn.addEventListener("click", sendMessage);
resetBtn.addEventListener("click", resetConversation);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
});