// RSC Console · Sockets to the robot: connect, commands and acks, the stop socket, disconnect.
"use strict";

// ---- Connection ----
const C = { ws: null, ctl: null, seq: 0, pending: new Map(), connected: false, expectClose: "" };
const supports = (verb) => !S.robot.verbs.size || S.robot.verbs.has(verb);

// Resolves with an open socket, or rejects. The browser can't tell a wrong
// token from an unreachable robot: both arrive as a plain close (host.md §2.1).
function openSocket(host, port, token, ms = 6000) {
    return new Promise((resolve, reject) => {
        let ws;
        try { ws = new WebSocket(`ws://${host}:${port}/`, ["bearer", token]); }
        catch (exc) { reject(exc); return; }
        const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("timed out")); }, ms);
        ws.onerror = () => {};
        ws.onclose = () => { clearTimeout(t); reject(new Error("closed")); };
        ws.onopen = () => { clearTimeout(t); ws.onclose = null; resolve(ws); };
    });
}

// Sends a command and resolves with its ack, or with null if the connection is gone.
// `urgent` uses the stop socket when it is open.
function request(verb, args = {}, opts = {}) {
    const ws = opts.urgent && C.ctl && C.ctl.readyState === WebSocket.OPEN ? C.ctl : C.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) { log("err", `not connected (${verb})`); return Promise.resolve(null); }
    const id = "c" + (++C.seq);
    const msg = { type: "cmd", id, verb, args };
    log("sent", verb + (Object.keys(args).length ? " " + JSON.stringify(args) : ""), msg);
    ws.send(JSON.stringify(msg));
    return new Promise((resolve) => C.pending.set(id, { verb, resolve }));
}
const send = (verb, args = {}, opts) => request(verb, args, opts);

function onMessage(e, main) {
    let msg;
    try { msg = JSON.parse(e.data); }
    catch { log("err", `unreadable message from the robot: ${String(e.data).slice(0, 120)}`); return; }
    if (msg.type === "ack") {
        const p = C.pending.get(msg.id);
        C.pending.delete(msg.id);
        const verb = p ? p.verb : msg.id || "?";
        if (msg.ok) log("ack", `${verb} ok`, msg);
        else log("err", `${verb}: ${msg.code}${msg.message ? " · " + msg.message : ""}`, msg);
        if (p) p.resolve(msg);
    } else if (msg.type === "event") {
        // Every socket receives every event; handle them once, from the main socket
        if (!main) return;
        log("event", `${msg.topic} ${JSON.stringify(msg.data ?? {})}`, msg);
        applyEvent(msg.topic, msg.data || {});
    } else {
        log("info", `unknown message: ${String(e.data).slice(0, 200)}`);
    }
}

async function connectTo(host, port, token, button) {
    const label = button ? button.innerHTML : "";
    if (button) { button.disabled = true; button.textContent = "Connecting…"; }
    formError("");
    $("#connectNote").hidden = true;
    log("info", `opening ws://${host}:${port}/`);
    let ws;
    try { ws = await openSocket(host, port, token); }
    catch {
        log("err", `couldn't connect to ${host}:${port}`);
        formError(`Couldn't connect to ${host}:${port}. Check that the robot is on and on this network, and that the token is right.` +
            (location.protocol === "https:" ? " This page was opened over https, and some browsers block connections to the robot from https pages; open the file from your computer instead." : ""));
        $("#cfHost").value = host;
        $("#cfPort").value = String(port);
        if (button) { button.disabled = false; button.innerHTML = label; }
        return;
    }
    if (button) { button.disabled = false; button.innerHTML = label; }
    C.ws = ws;
    C.connected = true;
    C.expectClose = "";
    ws.onmessage = (e) => onMessage(e, true);
    ws.onclose = (e) => onMainClose(e);
    log("info", `connected (subprotocol: ${ws.protocol})`);
    rememberRobot(host, port, token);
    S.robot = { host, port, version: "", backend: "", simulated: false, verbs: new Set(), missing: [], status: false, powerAllowed: false, powerReason: "", powerFix: "" };
    S.cal.holding = false;
    S.sound.result = null;
    S.sound.error = "";
    S.face = { mood: store.get(K.face, {})[host] || null, cycle: false };
    S.diag = {};
    renderRobotInfo();
    go("console");
    openStopSocket(host, port, token);
    await syncFromRobot();
}

// The second socket only ever carries stop commands, so they never wait behind a slow verb
async function openStopSocket(host, port, token) {
    try {
        const ctl = await openSocket(host, port, token);
        if (!C.connected) { ctl.close(); return; }
        C.ctl = ctl;
        ctl.onmessage = (e) => onMessage(e, false);
        ctl.onclose = () => { if (C.ctl === ctl) C.ctl = null; };
    } catch {
        log("info", "stop channel unavailable; stop commands share the main connection");
    }
}

function teardown() {
    C.connected = false;
    for (const p of C.pending.values()) p.resolve(null);
    C.pending.clear();
    for (const k of ["ctl", "ws"]) {
        const w = C[k];
        C[k] = null;
        if (w) { w.onclose = null; w.onmessage = null; try { w.close(); } catch {} }
    }
    clearTimeout(saveT);
    S.sound.running = false;
    S.cal.holding = false;
    endVoice(true);
}
function onMainClose(e) {
    const note = C.expectClose || `Lost the connection to ${S.robot.host}${e.code ? ` (code ${e.code})` : ""}.`;
    log("info", `connection closed (code ${e.code}${e.reason ? ", " + e.reason : ""})`);
    teardown();
    leave(note);
}
function leave(note) {
    go("connect");
    renderRecent();
    $("#connectNote").textContent = note;
    $("#connectNote").hidden = !note;
}
function disconnect() {
    const host = S.robot.host;
    // Nothing on the robot stops the motors when a client leaves (host.md §3), so stop them first
    stopRobotQuietly();
    C.expectClose = `Disconnected from ${host}.`;
    log("info", "disconnected");
    const ws = C.ws;
    setTimeout(() => { try { ws && ws.close(); } catch {} }, 150);
}
// Best effort: flippers stopped and calibration holds released, sent without waiting for replies
function stopRobotQuietly() {
    const ws = C.ctl && C.ctl.readyState === WebSocket.OPEN ? C.ctl : C.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
        ws.send(JSON.stringify({ type: "cmd", id: "leave-stop", verb: "flipper.stop_all", args: {} }));
        ws.send(JSON.stringify({ type: "cmd", id: "leave-release", verb: "servo.hold.stop", args: {} }));
    } catch {}
}
addEventListener("pagehide", () => { if (C.connected) stopRobotQuietly(); });
