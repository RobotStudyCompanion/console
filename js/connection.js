// RSC Console · Sockets to the robot: opening them, commands and acks, the stop socket, disconnect.
"use strict";

// ---- Connection ----
const C = { ws: null, ctl: null, seq: 0, pending: new Map(), connected: false, expectClose: "" };
const supports = (verb) => !S.robot.verbs.size || S.robot.verbs.has(verb);
// Run when the main connection closes, with the note to show; each feature adds its own clean-up
const onDisconnect = [];

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
function send(verb, args = {}, opts = {}) {
    const ws = opts.urgent && C.ctl && C.ctl.readyState === WebSocket.OPEN ? C.ctl : C.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) { log("err", `not connected (${verb})`); return Promise.resolve(null); }
    const id = "c" + (++C.seq);
    const msg = { type: "cmd", id, verb, args };
    log("sent", verb + (Object.keys(args).length ? " " + JSON.stringify(args) : ""), msg);
    ws.send(JSON.stringify(msg));
    return new Promise((resolve) => C.pending.set(id, { verb, resolve }));
}

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

// Opens the main socket and makes it this console's connection. Rejects if the robot can't be reached.
async function openRobot(host, port, token) {
    log("info", `opening ws://${host}:${port}/`);
    const ws = await openSocket(host, port, token);
    Object.assign(C, { ws, connected: true, expectClose: "" });
    ws.onmessage = (e) => onMessage(e, true);
    ws.onclose = onMainClose;
    log("info", `connected (subprotocol: ${ws.protocol})`);
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

function onMainClose(e) {
    const note = C.expectClose || `Lost the connection to ${S.robot.host}${e.code ? ` (code ${e.code})` : ""}.`;
    log("info", `connection closed (code ${e.code}${e.reason ? ", " + e.reason : ""})`);
    C.connected = false;
    for (const p of C.pending.values()) p.resolve(null);
    C.pending.clear();
    for (const k of ["ctl", "ws"]) {
        const w = C[k];
        C[k] = null;
        if (w) { w.onclose = null; w.onmessage = null; try { w.close(); } catch {} }
    }
    onDisconnect.forEach((f) => f(note));
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
// Best effort: flippers stopped and calibration holds released, without waiting for replies
function stopRobotQuietly() {
    send("flipper.stop_all", {}, { urgent: true });
    send("servo.hold.stop", {}, { urgent: true });
}
addEventListener("pagehide", () => { if (C.connected) stopRobotQuietly(); });

// What the connect page says after the robot was told to restart or shut down
const powerNote = (action) => action === "reboot"
    ? `${S.robot.host} is restarting. It should be back in about a minute.`
    : `${S.robot.host} is shutting down. Someone has to reach its power supply to start it again.`;
