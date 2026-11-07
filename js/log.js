// RSC Console · The log column: entries, filters, unread badge, docking and resizing.
"use strict";

// ---- Log ----
const LOG = [];
const KIND = { sent: "sent", ack: "reply", err: "error", event: "event", info: "info" };
let unread = 0;
const fmtTime = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const matchesFilter = (kind) => S.dock.filter === "all" || S.dock.filter === kind;
const logVisible = () => S.dock.state === "open" && S.view !== "settings" && (!phone.matches || logBodyOpen || logExpanded);

function log(kind, text, data) {
    const e = { t: new Date(), kind, text, data };
    LOG.push(e);
    if (LOG.length > 1000) LOG.shift();
    const list = $("#logList");
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const li = document.createElement("li");
    li.className = "le " + kind;
    li.dataset.kind = kind;
    li.innerHTML = `<button type="button" class="le-btn" aria-expanded="false"><span class="ts">${fmtTime(e.t)}</span><span class="k">${KIND[kind]}</span><span class="txt">${esc(text)}</span></button>` +
        (data ? `<pre hidden>${esc(JSON.stringify(data, null, 2))}</pre>` : "");
    li.hidden = !matchesFilter(kind);
    list.appendChild(li);
    while (list.children.length > 1000) list.firstElementChild.remove();
    if (atBottom) list.scrollTop = list.scrollHeight;
    if (!logVisible()) unread++;
    renderLogHead();
}
function renderLogHead() {
    const last = LOG[LOG.length - 1];
    $("#logLast").textContent = last ? `${fmtTime(last.t)} ${last.text}` : "Nothing logged yet";
    ["#logBadge", "#tbLogBadge"].forEach((s) => {
        $(s).hidden = unread === 0;
        $(s).textContent = unread > 99 ? "99+" : String(unread);
    });
}
function applyFilter() {
    $$("#logList > li").forEach((li) => { li.hidden = !matchesFilter(li.dataset.kind); });
    $$(".log-filters button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.act === "filter:" + S.dock.filter)));
}
function applyDock() {
    const b = document.body, lg = $("#log");
    b.dataset.log = S.dock.state;
    b.style.setProperty("--log-w", S.dock.w + "px");
    b.style.setProperty("--log-h", S.dock.h + "px");
    lg.toggleAttribute("data-open", logBodyOpen);
    lg.toggleAttribute("data-expanded", logExpanded);
    $(".log-title").setAttribute("aria-expanded", String(logBodyOpen));
    const ex = $("#logExpand");
    ex.innerHTML = `<svg class="ic"><use href="#${logExpanded ? "i-shrink" : "i-expand"}"/></svg>`;
    ex.setAttribute("aria-label", logExpanded ? "Shrink log" : "Expand log");
    ex.title = logExpanded ? "Shrink" : "Expand";
    if (logVisible()) { unread = 0; const l = $("#logList"); l.scrollTop = l.scrollHeight; }
    renderLogHead();
    store.set(K.log, { state: S.dock.state, w: S.dock.w, h: S.dock.h, filter: S.dock.filter });
    $("#logToggle").setAttribute("aria-pressed", String(S.dock.state === "open"));
}
function setDock(state) { S.dock.state = state; if (state === "closed") logExpanded = false; applyDock(); }
function revealLog() {
    if (S.dock.state === "closed") S.dock.state = "open";
    if (phone.matches) logBodyOpen = true;
    applyDock();
}

// Drag the log's inner edge: width when it is a column, height when it sits below
const grip = $("#logGrip");
grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sw = S.dock.w, sh = S.dock.h, byWidth = wide.matches;
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => {
        if (byWidth) S.dock.w = Math.round(clamp(sw + (sx - ev.clientX), 280, Math.max(280, innerWidth - 560)));
        else S.dock.h = Math.round(clamp(sh + (sy - ev.clientY), 140, Math.max(140, innerHeight - 220)));
        document.body.style.setProperty("--log-w", S.dock.w + "px");
        document.body.style.setProperty("--log-h", S.dock.h + "px");
    };
    const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        applyDock();
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
});
grip.addEventListener("keydown", (e) => {
    const d = wide.matches ? { ArrowLeft: 24, ArrowRight: -24 }[e.key] : { ArrowUp: 24, ArrowDown: -24 }[e.key];
    if (!d) return;
    e.preventDefault();
    if (wide.matches) S.dock.w = clamp(S.dock.w + d, 280, Math.max(280, innerWidth - 560));
    else S.dock.h = clamp(S.dock.h + d, 140, Math.max(140, innerHeight - 220));
    applyDock();
});
