// RSC Console · The Connect page: recent robots, the form, Scan, and connecting.
"use strict";

// ---- Connect page ----
// Recent robots: this page's own list, plus hosts the old single-file console remembered
function recentRobots() {
    let list = store.get(K.recent, []);
    if (!Array.isArray(list)) list = [];
    const known = store.get(K.known, []);
    if (Array.isArray(known)) for (const h of known) if (typeof h === "string" && !list.some((r) => r.host === h)) list.push({ host: h, port: 8765, at: 0 });
    return list.filter((r) => r && r.host).sort((a, b) => (b.at || 0) - (a.at || 0));
}
function rememberRobot(host, port, token) {
    const list = recentRobots().filter((r) => r.host !== host);
    list.unshift({ host, port, at: Date.now() });
    store.set(K.recent, list.slice(0, 20));
    const known = new Set(store.get(K.known, []));
    known.add(host);
    store.set(K.known, [...known].sort());
    if (token) store.setRaw(K.token(host), token);
}
function forgetRobot(host) {
    store.set(K.recent, recentRobots().filter((r) => r.host !== host));
    store.set(K.known, (store.get(K.known, []) || []).filter((h) => h !== host));
    store.del(K.token(host));
}
function ago(at) {
    if (!at) return "";
    const s = (Date.now() - at) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? "yesterday" : `${d} days ago`;
}
function renderRecent() {
    const list = recentRobots();
    $("#recentList").innerHTML = list.map((r) => {
        const meta = [`port ${r.port}`, store.raw(K.token(r.host)) ? "token saved" : "no token saved", ago(r.at)].filter(Boolean).join(" · ");
        return `<li class="robot-row">
        <span class="rr-ic" aria-hidden="true"><svg class="ic" viewBox="0 0 32 32"><use href="#i-bot"/></svg></span>
        <div class="rr-main"><span class="rr-name">${esc(r.host)}</span><span class="rr-meta">${esc(meta)}</span></div>
        <button type="button" class="btn primary sm" data-act="connect:${esc(r.host)}">Connect</button>
        <button type="button" class="icon-btn sm" data-act="forget:${esc(r.host)}" aria-label="Forget ${esc(r.host)}" title="Forget this robot and its token"><svg class="ic"><use href="#i-x"/></svg></button></li>`;
    }).join("");
    $("#recentWrap").hidden = list.length === 0;
}
function formError(msg) {
    $("#cfErr").textContent = msg;
    $("#cfErr").hidden = !msg;
}
$("#connectForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const host = $("#cfHost").value.trim(), portRaw = $("#cfPort").value.trim(), token = $("#cfToken").value;
    const port = portRaw === "" ? 8765 : Number(portRaw);
    let msg = "";
    if (!host) msg = "Enter the robot's address, for example rsc-shiny.local.";
    else if (!Number.isInteger(port) || port < 1 || port > 65535) msg = "The port must be a whole number from 1 to 65535.";
    else if (!token) msg = "Enter the robot's token.";
    formError(msg);
    if (msg) return;
    connectTo(host, port, token, $("#cfSubmit"));
});
// A known robot's saved token fills in as you type its address
$("#cfHost").addEventListener("input", () => {
    const saved = store.raw(K.token($("#cfHost").value.trim()));
    if (saved && !$("#cfToken").value) $("#cfToken").value = saved;
});

// Scan: browsers can't search the network, so this tries likely names. A
// browser can't tell "no such name" from "robot said no" either, so every hit
// is only "possible" (host.md §4.2).
const SCAN_CANDIDATES = ["rsc-shiny", "rsc-pinky", "rsc-minion", "rsc-01", "rsc-02", "rsc-03", "shiny", "pinky", "minion"];
function probe(host, port, ms = 1500) {
    return new Promise((resolve) => {
        let done = false, sock;
        const finish = (found) => { if (done) return; done = true; try { sock.close(); } catch {} resolve(found); };
        try { sock = new WebSocket(`ws://${host}:${port}/`, ["bearer", "probe"]); }
        catch { resolve(false); return; }
        sock.onopen = () => finish(true);
        sock.onerror = () => {};
        sock.onclose = () => finish(true);
        setTimeout(() => finish(false), ms);
    });
}
async function scan(el) {
    const port = Number($("#cfPort").value.trim()) || 8765;
    const names = new Set([...recentRobots().map((r) => r.host.replace(/\.local$/, "")), ...SCAN_CANDIDATES]);
    el.disabled = true;
    el.textContent = "Scanning…";
    $("#scanList").hidden = true;
    log("info", `scanning ${names.size} likely names on port ${port}`);
    const hits = [];
    await Promise.all([...names].map(async (n) => { const h = n.includes(".") ? n : `${n}.local`; if (await probe(h, port)) hits.push(h); }));
    el.disabled = false;
    el.textContent = "Scan network";
    hits.sort();
    $("#scanList").innerHTML = hits.length
        ? hits.map((h) => `<li><span class="rr-name">${esc(h)}</span><span class="chip">possible</span><button type="button" class="btn sm" data-act="useScan:${esc(h)}">Use</button></li>`).join("")
        : `<li><span class="rr-name">Nothing answered. Type the robot's address instead.</span></li>`;
    $("#scanList").hidden = false;
}

// ---- Connecting ----
async function connectTo(host, port, token, button) {
    const label = button ? button.innerHTML : "";
    if (button) { button.disabled = true; button.textContent = "Connecting…"; }
    formError("");
    $("#connectNote").hidden = true;
    let ok = true;
    try { await openRobot(host, port, token); } catch { ok = false; }
    if (button) { button.disabled = false; button.innerHTML = label; }
    if (!ok) {
        log("err", `couldn't connect to ${host}:${port}`);
        formError(`Couldn't connect to ${host}:${port}. Check that the robot is on and on this network, and that the token is right.` +
            (location.protocol === "https:" ? " This page was opened over https, and some browsers block connections to the robot from https pages; open the file from your computer instead." : ""));
        $("#cfHost").value = host;
        $("#cfPort").value = String(port);
        return;
    }
    rememberRobot(host, port, token);
    Object.assign(S, robotState(host, port));
    renderRobotInfo();
    go("console");
    openStopSocket(host, port, token);
    await syncFromRobot();
}
// Back to this page when the connection closes, saying why
function leave(note) {
    go("connect");
    renderRecent();
    $("#connectNote").textContent = note;
    $("#connectNote").hidden = !note;
}
onDisconnect.push(leave);

Object.assign(ACTIONS, {
    connect: {
        run: (arg, el) => {
            const r = recentRobots().find((x) => x.host === arg);
            if (!r) return;
            const token = store.raw(K.token(r.host));
            if (token) { connectTo(r.host, r.port || 8765, token, el); return; }
            $("#cfHost").value = r.host;
            $("#cfPort").value = String(r.port || 8765);
            formError(`Enter the token for ${r.host}.`);
            $("#cfToken").focus();
        },
    },
    forget: { run: (arg) => { forgetRobot(arg); renderRecent(); } },
    scan: { run: (arg, el) => scan(el) },
    useScan: { run: (arg) => { $("#cfHost").value = arg; $("#cfHost").dispatchEvent(new Event("input")); $("#cfToken").focus(); } },
});
