const API_BASE = ""; // same-origin, since FastAPI serves this frontend too

const notebook = document.getElementById("notebook");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const resetBtn = document.getElementById("reset-btn");

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
