// RSC Console · The Chat page. sendToRobot() and listenOnRobot() are the swap points for the real backend.
"use strict";

// ---- Chat ----
// sendToRobot() is the swap point for the real chat. It must be an async generator
// that yields pieces of the answer as text. The robot has no chat yet (PLAN.md step 3),
// so for now it fails, and the chat says so instead of making up an answer.
async function* sendToRobot() {
    throw new Error("The robot can't answer yet: chat isn't built into rsc-host.");
}
// listenOnRobot() is the swap point for voice: the robot listens with its own
// microphone and returns the words it heard. Needs speech-to-text on rsc-host.
const VOICE_LINES = ["Can you quiz me on what I studied today?", "Explain spaced repetition again, but shorter", "Make a study plan for 90 minutes"];
let voiceN = 0;
function listenOnRobot({ signal, onFinish }) {
    return new Promise((resolve, reject) => {
        const done = () => { clearTimeout(t); resolve(VOICE_LINES[voiceN++ % VOICE_LINES.length]); };
        const t = setTimeout(done, 2600);
        onFinish(done);
        signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); }, { once: true });
    });
}

// Conversations live in this browser. Attachments are kept by name and size only.
let CHATS = store.get(K.chats, []);
if (!Array.isArray(CHATS)) CHATS = [];
const newChatObj = () => ({ id: "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: "New chat", at: Date.now(), msgs: [{ role: "intro" }] });
if (!CHATS.length) CHATS.push(newChatObj());
let chatId = CHATS[0].id, chatStream = null, chatVoice = null, chatFiles = [];
const curChat = () => CHATS.find((c) => c.id === chatId) || CHATS[0];
const saveChats = () => store.set(K.chats, CHATS.slice(0, 50));
const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const fileChip = (f, i) => `<span class="file-chip"><svg class="ic"><use href="#i-file"/></svg><span class="fn">${esc(f.name)}</span><small>${fmtSize(f.size)}</small>${i == null ? "" : `<button type="button" class="icon-btn sm" data-act="unattach:${i}" aria-label="Remove ${esc(f.name)}"><svg class="ic"><use href="#i-x"/></svg></button>`}</span>`;
const via = (icon, text) => `<span class="via"><svg class="ic"><use href="#${icon}"/></svg>${text}</span>`;

function md(t) {
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    let html = "", list = null;
    for (const ln of esc(t).split("\n")) {
        let m;
        if ((m = ln.match(/^\d+\. (.*)/))) { if (list !== "ol") { html += (list ? `</${list}>` : "") + "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
        else if ((m = ln.match(/^- (.*)/))) { if (list !== "ul") { html += (list ? `</${list}>` : "") + "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
        else { if (list) { html += `</${list}>`; list = null; } if (ln.trim()) html += `<p>${inline(ln)}</p>`; }
    }
    return html + (list ? `</${list}>` : "");
}
function msgHTML(m) {
    if (m.role === "intro") {
        return `<div class="msg ai"><p><strong>Chat isn't connected to the robot yet.</strong> Messages are saved only in this browser, and nothing is sent to the robot.</p></div>`;
    }
    if (m.role === "user") {
        return `<div class="msg user">${m.voice ? via("i-mic", "Spoken") : ""}${m.files?.length ? `<div class="att">${m.files.map((f) => fileChip(f)).join("")}</div>` : ""}${m.text ? `<p>${esc(m.text).replace(/\n/g, "<br>")}</p>` : ""}</div>`;
    }
    return `<div class="msg ai">${m.spoken ? via("i-speaker", "Read aloud by the robot") : ""}${md(m.text)}${m.error ? `<p class="form-err">${esc(m.error)}</p>` : ""}</div>`;
}
function chatGroup(at) {
    const day = (d) => new Date(d).setHours(0, 0, 0, 0);
    const days = Math.round((day(Date.now()) - day(at)) / 86400000);
    return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "Previous 7 days" : "Older";
}
function chatListHTML() {
    const sorted = [...CHATS].sort((a, b) => b.at - a.at);
    return ["Today", "Yesterday", "Previous 7 days", "Older"].map((g) => {
        const cs = sorted.filter((c) => chatGroup(c.at) === g);
        return cs.length ? `<p class="side-label">${g}</p>` + cs.map((c) => `<button type="button" class="chat-item" data-act="openChat:${c.id}"${c.id === chatId ? ' aria-current="page"' : ""} title="${esc(c.title)}">${esc(c.title)}</button>`).join("") : "";
    }).join("");
}
function renderChatLists() {
    const html = chatListHTML();
    $("#chatSideList").innerHTML = html;
    $("#menuChatList").innerHTML = html;
}
function renderChat() {
    const c = curChat();
    chatId = c.id;
    $("#chatTitle").textContent = c.title;
    $("#chatMsgs").innerHTML = c.msgs.filter((m) => m.role !== "ai" || m.text || m.error).map(msgHTML).join("");
    renderChatLists();
    renderFiles();
    scrollChat();
    syncComposer();
}
const scrollChat = () => { const s = $("#chatScroll"); s.scrollTop = s.scrollHeight; };
function renderFiles() {
    const fbox = $("#fileChips");
    fbox.hidden = chatFiles.length === 0;
    fbox.innerHTML = chatFiles.map((f, i) => fileChip(f, i)).join("");
}
function syncComposer() {
    const b = $("#chatSend"), listening = !!chatVoice;
    b.innerHTML = chatStream ? '<svg class="ic"><use href="#i-stop"/></svg><span>Stop</span>' : '<svg class="ic"><use href="#i-send"/></svg><span>Send</span>';
    b.classList.toggle("primary", !chatStream);
    b.disabled = listening;
    $("#chatInput").hidden = listening;
    $("#listening").hidden = !listening;
    const mic = $("#micBtn");
    mic.classList.toggle("rec", listening);
    mic.disabled = !!chatStream;
    mic.setAttribute("aria-pressed", String(listening));
    const label = listening ? "Stop listening and send" : "Talk to the robot";
    mic.setAttribute("aria-label", label);
    mic.title = label;
    $('[data-act="attach"]').disabled = listening;
}
async function sendChat(raw, opts = {}) {
    const text = raw.trim(), files = chatFiles;
    if ((!text && !files.length) || chatStream) return;
    chatFiles = [];
    const c = curChat();
    const history = c.msgs.filter((m) => m.role === "user" || (m.role === "ai" && m.text)).map((m) => ({ role: m.role, text: m.text }));
    c.msgs.push({ role: "user", text, files, voice: !!opts.voice });
    c.at = Date.now();
    if (c.title === "New chat") { const t = text || files[0].name; c.title = t.length > 42 ? t.slice(0, 40) + "…" : t; }
    log("info", `chat: "${text}"${files.length ? ` with ${files.length} file${files.length > 1 ? "s" : ""}` : ""}`);
    const m = { role: "ai", text: "", spoken: !!opts.voice };
    c.msgs.push(m);
    renderChat();
    const el = document.createElement("div");
    el.className = "msg ai";
    el.innerHTML = '<span class="dots" aria-label="Thinking"><i></i><i></i><i></i></span>';
    $("#chatMsgs").appendChild(el);
    scrollChat();
    const ctrl = new AbortController();
    chatStream = ctrl;
    syncComposer();
    try {
        for await (const piece of sendToRobot(text, { files, history, signal: ctrl.signal })) {
            m.text += piece;
            if (chatId === c.id) {
                el.innerHTML = (m.spoken ? via("i-speaker", "Read aloud by the robot") : "") + md(m.text) + '<span class="cursor"></span>';
                scrollChat();
            }
        }
    } catch (exc) {
        if (exc.name !== "AbortError") { log("err", `chat: ${exc.message}`); m.error = exc.message; }
    } finally {
        if (chatStream === ctrl) chatStream = null;
        if (!m.text && !m.error) c.msgs.pop();
        saveChats();
        if (S.view === "chat") renderChat();
    }
}
function stopStream() { if (chatStream) chatStream.abort(); }
async function startVoice() {
    if (chatStream || chatVoice) return;
    const ctrl = new AbortController();
    chatVoice = { ctrl, finish: null };
    syncComposer();
    log("info", "chat: listening (stand-in: rsc-host has no speech-to-text yet)");
    try {
        const heard = await listenOnRobot({ signal: ctrl.signal, onFinish: (f) => { if (chatVoice) chatVoice.finish = f; } });
        chatVoice = null;
        syncComposer();
        if (heard) sendChat(heard, { voice: true });
    } catch {
        chatVoice = null;
        syncComposer();
    }
}
function endVoice(cancel) {
    if (!chatVoice) return;
    if (cancel) chatVoice.ctrl.abort();
    else chatVoice.finish?.();
}
$("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    if (chatStream) { stopStream(); return; }
    const ta = $("#chatInput");
    sendChat(ta.value);
    ta.value = "";
    ta.style.height = "auto";
});
$("#chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
});
$("#chatInput").addEventListener("input", (e) => { const t = e.target; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; });
$("#fileInput").addEventListener("change", (e) => {
    for (const f of e.target.files) chatFiles.push({ name: f.name, size: f.size });
    e.target.value = "";
    renderFiles();
    $("#chatInput").focus();
});
onDisconnect.push(() => endVoice(true));

function openChat(id) {
    stopStream();
    endVoice(true);
    chatId = id;
    closeMenu();
    renderChat();
}
function newChat() {
    stopStream();
    endVoice(true);
    // Reuse an empty chat instead of piling up blank ones
    const blank = CHATS.find((c) => c.msgs.every((m) => m.role === "intro"));
    const c = blank || newChatObj();
    if (!blank) CHATS.unshift(c);
    c.at = Date.now();
    chatId = c.id;
    saveChats();
    closeMenu();
    renderChat();
    $("#chatInput").focus();
}
Object.assign(ACTIONS, {
    openChat: { run: openChat },
    newChat: { run: newChat },
    attach: { run: () => $("#fileInput").click() },
    unattach: { run: (arg) => { chatFiles.splice(Number(arg), 1); renderFiles(); } },
    voice: { run: () => (chatVoice ? endVoice(false) : startVoice()) },
});
