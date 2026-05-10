/* ═══════════════════════════════════════════════════════════
   NotebookLM RAG — Frontend App
   Talks to the Node.js backend via REST API
   ═══════════════════════════════════════════════════════════ */

const API_BASE = "http://localhost:3000"; // Change to deployed backend URL

/* ── State ─────────────────────────────────────────────── */
const state = {
  sources: [],           // [{ id, name, size, pageCount, collectionName }]
  activeSource: null,    // current source id
  messages: [],          // [{ role, content, sources }]
  isLoading: false,
  selectedFile: null,
};

/* ── Element refs ─────────────────────────────────────── */
const $ = id => document.getElementById(id);

const el = {
  sidebar:       $("sidebar"),
  sidebarToggle: $("sidebarToggle"),
  mobileMenu:    $("mobileMenu"),
  sourceList:    $("sourceList"),
  heroSection:   $("heroSection"),
  chatArea:      $("chatArea"),
  messages:      $("messages"),
  chatStatus:    $("chatStatus"),
  statusText:    $("statusText"),
  inputBar:      $("inputBar"),
  chatInput:     $("chatInput"),
  sendBtn:       $("sendBtn"),
  topbarTitle:   $("topbarTitle"),

  // Modal
  modalOverlay:  $("modalOverlay"),
  dropZone:      $("dropZone"),
  fileInput:     $("fileInput"),
  dropBrowse:    $("dropBrowse"),
  uploadProgress:$("uploadProgress"),
  progressName:  $("progressName"),
  progressBar:   $("progressBar"),
  progressStep:  $("progressStep"),
  uploadBtn:     $("uploadBtn"),
  cancelBtn:     $("cancelBtn"),
  modalClose:    $("modalClose"),

  // Toast
  toast:         $("toast"),

  // Buttons
  heroUploadBtn: $("heroUploadBtn"),
  openUploadBtn: $("openUploadBtn"),
};

/* ── Toast ─────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = "") {
  el.toast.textContent = msg;
  el.toast.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.className = "toast", 3200);
}

/* ── Modal ─────────────────────────────────────────────── */
function openModal() {
  resetUploadModal();
  el.modalOverlay.classList.add("visible");
}
function closeModal() {
  el.modalOverlay.classList.remove("visible");
  setTimeout(resetUploadModal, 250);
}
function resetUploadModal() {
  state.selectedFile = null;
  el.fileInput.value = "";
  el.uploadProgress.style.display = "none";
  el.dropZone.style.display = "block";
  el.uploadBtn.disabled = true;
  el.progressBar.style.width = "0%";
}

/* ── Sidebar toggle ────────────────────────────────────── */
el.sidebarToggle.addEventListener("click", () => {
  el.sidebar.classList.toggle("collapsed");
});
el.mobileMenu.addEventListener("click", () => {
  el.sidebar.classList.toggle("open");
});

/* ── Open modal triggers ────────────────────────────────── */
el.heroUploadBtn.addEventListener("click", openModal);
el.openUploadBtn.addEventListener("click", openModal);
el.cancelBtn.addEventListener("click", closeModal);
el.modalClose.addEventListener("click", closeModal);
el.modalOverlay.addEventListener("click", e => {
  if (e.target === el.modalOverlay) closeModal();
});

/* ── Drag & drop ───────────────────────────────────────── */
el.dropZone.addEventListener("click", () => el.fileInput.click());
el.dropBrowse.addEventListener("click", e => { e.stopPropagation(); el.fileInput.click(); });

el.dropZone.addEventListener("dragover", e => { e.preventDefault(); el.dropZone.classList.add("drag-over"); });
el.dropZone.addEventListener("dragleave", () => el.dropZone.classList.remove("drag-over"));
el.dropZone.addEventListener("drop", e => {
  e.preventDefault(); el.dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

el.fileInput.addEventListener("change", () => {
  if (el.fileInput.files[0]) handleFileSelect(el.fileInput.files[0]);
});

function handleFileSelect(file) {
  const validTypes = ["application/pdf", "text/plain"];
  const validExts  = [".pdf", ".txt"];
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
    showToast("Only PDF and TXT files are supported.", "error");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("File must be under 20 MB.", "error");
    return;
  }

  state.selectedFile = file;
  el.uploadBtn.disabled = false;

  // Update drop zone UI
  el.dropZone.querySelector(".drop-title").textContent = file.name;
  el.dropZone.querySelector(".drop-sub").textContent = formatBytes(file.size);
  el.dropZone.querySelector(".drop-hint").textContent = ext === ".pdf" ? "PDF selected" : "Text file selected";
  el.dropZone.querySelector(".drop-icon").innerHTML = `
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" stroke="#2a4a3e" stroke-width="1.5"/>
      <path d="M12 20l6 6 10-10" stroke="#2a4a3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

/* ── Upload & Index ─────────────────────────────────────── */
el.uploadBtn.addEventListener("click", async () => {
  if (!state.selectedFile) return;

  const file = state.selectedFile;
  el.dropZone.style.display = "none";
  el.uploadProgress.style.display = "block";
  el.uploadBtn.disabled = true;
  el.cancelBtn.disabled = true;

  el.progressName.textContent = file.name;
  setProgress(5, "Uploading file…");

  const formData = new FormData();
  formData.append("file", file);

  try {
    // Step 1: Upload
    const uploadRes = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) throw new Error((await uploadRes.json()).error || "Upload failed");
    const { fileId, fileName } = await uploadRes.json();

    setProgress(30, "Chunking document…");
    await sleep(400);
    setProgress(55, "Generating embeddings…");

    // Step 2: Index
    const indexRes = await fetch(`${API_BASE}/api/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });

    if (!indexRes.ok) throw new Error((await indexRes.json()).error || "Indexing failed");
    const { collectionName, pageCount } = await indexRes.json();

    setProgress(85, "Storing vectors…");
    await sleep(400);
    setProgress(100, "Done!");
    await sleep(500);

    // Add source to list
    const source = {
      id: fileId,
      name: fileName,
      size: file.size,
      pageCount,
      collectionName,
    };
    state.sources.push(source);
    addSourceToSidebar(source);
    setActiveSource(source.id);

    closeModal();
    showToast("Document indexed successfully!", "success");

  } catch (err) {
    console.error(err);
    showToast(err.message || "Something went wrong.", "error");
    el.dropZone.style.display = "block";
    el.uploadProgress.style.display = "none";
    el.uploadBtn.disabled = false;
    el.cancelBtn.disabled = false;
  }
});

function setProgress(pct, label) {
  el.progressBar.style.width = pct + "%";
  el.progressStep.textContent = label;
}

/* ── Sidebar source management ─────────────────────────── */
function addSourceToSidebar(source) {
  // Remove empty state
  const empty = el.sourceList.querySelector(".empty-state-sidebar");
  if (empty) empty.remove();

  const ext = source.name.slice(source.name.lastIndexOf(".") + 1).toUpperCase();
  const item = document.createElement("div");
  item.className = "source-item";
  item.dataset.id = source.id;
  item.innerHTML = `
    <div class="source-item-icon">${ext}</div>
    <div class="source-item-info">
      <div class="source-item-name" title="${escHtml(source.name)}">${escHtml(source.name)}</div>
      <div class="source-item-meta">${source.pageCount ? source.pageCount + " pages · " : ""}${formatBytes(source.size)}</div>
    </div>
    <button class="source-item-del" title="Remove" aria-label="Remove ${escHtml(source.name)}">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>`;

  item.querySelector(".source-item-del").addEventListener("click", e => {
    e.stopPropagation();
    removeSource(source.id);
  });

  item.addEventListener("click", () => setActiveSource(source.id));
  el.sourceList.appendChild(item);
}

function setActiveSource(id) {
  state.activeSource = id;
  // Update sidebar
  document.querySelectorAll(".source-item").forEach(item => {
    item.classList.toggle("active", item.dataset.id === id);
  });

  const source = state.sources.find(s => s.id === id);
  if (!source) return;

  el.topbarTitle.textContent = source.name;
  el.chatInput.disabled = false;
  el.chatInput.placeholder = `Ask anything about "${source.name}"…`;
  syncSendBtn();

  // Switch view
  el.heroSection.classList.add("hidden");
  el.chatArea.classList.add("visible");

  // Filter messages for this source (or clear)
  renderMessages();
}

function removeSource(id) {
  // Call backend
  fetch(`${API_BASE}/api/source/${id}`, { method: "DELETE" }).catch(() => {});

  state.sources = state.sources.filter(s => s.id !== id);
  state.messages = state.messages.filter(m => m.sourceId !== id);

  const item = el.sourceList.querySelector(`[data-id="${id}"]`);
  if (item) item.remove();

  if (state.sources.length === 0) {
    el.sourceList.innerHTML = `<div class="empty-state-sidebar">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="6" y="4" width="20" height="24" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M10 10h12M10 14h12M10 18h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <p>No documents yet</p>
    </div>`;
    el.heroSection.classList.remove("hidden");
    el.chatArea.classList.remove("visible");
    el.chatInput.disabled = true;
    el.sendBtn.disabled = true;
    el.topbarTitle.textContent = "Start a new notebook";
    state.activeSource = null;
  } else if (state.activeSource === id) {
    setActiveSource(state.sources[state.sources.length - 1].id);
  }
}

/* ── Chat ───────────────────────────────────────────────── */
el.chatInput.addEventListener("input", () => {
  // Auto-grow
  el.chatInput.style.height = "auto";
  el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 160) + "px";
  syncSendBtn();
});

el.chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

el.sendBtn.addEventListener("click", sendMessage);

function syncSendBtn() {
  el.sendBtn.disabled = el.chatInput.disabled || el.chatInput.value.trim() === "" || state.isLoading;
}

async function sendMessage() {
  const query = el.chatInput.value.trim();
  if (!query || !state.activeSource || state.isLoading) return;

  // Clear input
  el.chatInput.value = "";
  el.chatInput.style.height = "auto";
  syncSendBtn();

  const source = state.sources.find(s => s.id === state.activeSource);

  // Push user message
  addMessage({ role: "user", content: query, sourceId: state.activeSource });
  renderMessages();

  // Show loading
  state.isLoading = true;
  syncSendBtn();
  el.chatStatus.style.display = "flex";
  el.statusText.textContent = "Searching document…";
  scrollMessages();

  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        collectionName: source.collectionName,
        sourceId: state.activeSource,
      }),
    });

    if (!res.ok) throw new Error((await res.json()).error || "Query failed");
    const { answer, chunks } = await res.json();

    addMessage({
      role: "assistant",
      content: answer,
      sourceId: state.activeSource,
      chunks,
    });

  } catch (err) {
    addMessage({
      role: "assistant",
      content: "⚠️ " + (err.message || "Failed to get a response. Please try again."),
      sourceId: state.activeSource,
      isError: true,
    });
  } finally {
    state.isLoading = false;
    el.chatStatus.style.display = "none";
    syncSendBtn();
    renderMessages();
    scrollMessages();
  }
}

function addMessage(msg) {
  state.messages.push(msg);
}

function renderMessages() {
  const filtered = state.messages.filter(m => m.sourceId === state.activeSource);
  el.messages.innerHTML = "";
  filtered.forEach(m => el.messages.appendChild(buildMsgEl(m)));
}

function buildMsgEl(msg) {
  const div = document.createElement("div");
  div.className = "msg";

  const avatarLabel = msg.role === "user" ? "YOU" : "◈";
  const roleLabel   = msg.role === "user" ? "You" : "NotebookLM";

  let chunksHtml = "";
  if (msg.chunks && msg.chunks.length) {
    chunksHtml = `<div class="msg-sources">
      ${msg.chunks.map(c => `<span class="source-chip">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/></svg>
        Page ${c.page || "—"}
      </span>`).join("")}
    </div>`;
  }

  div.innerHTML = `
    <div class="msg-avatar ${msg.role}">${avatarLabel}</div>
    <div class="msg-body">
      <div class="msg-role">${roleLabel}</div>
      <div class="msg-text">${formatMsgContent(msg.content)}</div>
      ${chunksHtml}
    </div>`;

  return div;
}

function formatMsgContent(text) {
  // Very simple markdown-like: code blocks, inline code, paragraphs
  return text
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${escHtml(code.trim())}</pre>`)
    .replace(/`([^`]+)`/g, (_, code) => `<code>${escHtml(code)}</code>`)
    .split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

function scrollMessages() {
  requestAnimationFrame(() => {
    el.chatArea.scrollTop = el.chatArea.scrollHeight;
  });
}

/* ── Utils ──────────────────────────────────────────────── */
function formatBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
