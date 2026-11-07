// RSC Console · Reading the robot after connecting, and following its events.
"use strict";

// ---- Reading the robot's state after connecting ----
async function syncFromRobot() {
    const st = await send("status");
    if (st?.ok) {
        S.robot.version = st.result?.version || "";
        S.robot.verbs = new Set(st.result?.verbs || []);
    }
    const ps = await send("peripherals.status");
    if (ps?.ok && ps.result) applyPeripherals(ps.result);
    S.robot.status = true;
    if (!S.robot.simulated && supports("system.power_status")) {
        const pw = await send("system.power_status");
        S.robot.powerAllowed = !!(pw?.ok && pw.result?.allowed);
        S.robot.powerReason = pw?.result?.reason || "";
        S.robot.powerFix = pw?.result?.fix || "";
    }
    if (supports("audio.volume.get")) {
        const v = await send("audio.volume.get");
        if (v?.ok && v.result) applyVolume(v.result);
    }
    if (supports("audio.mixer.get")) await readMixer();
    if (supports("audio.devices")) {
        const d = await send("audio.devices");
        if (d?.ok) S.sound.device = deviceName(d.result);
    }
    // The screen has its own power supply, so it stays blank after a shutdown from this console until something wakes it
    if (!S.robot.simulated && supports("cyd.raw")) send("cyd.raw", { line: "resume" });
    renderRobotInfo();
    refreshPanel();
}
function applyPeripherals(p) {
    S.robot.backend = p.backend || "";
    S.robot.simulated = p.backend === "fake";
    for (const id of ["left", "right"]) {
        const f = p.flippers?.[id];
        if (f && typeof f.speed === "number") S.flip[id] = fromRobot(id, f.speed);
        const c = p.servo_calibration?.[id];
        if (c && typeof c.null_us === "number") S.cal.stored[id] = c.null_us;
    }
    S.ring.mode = p.ring?.current_mode || "off";
    S.led.mode = p.button_led?.mode || "off";
    if (p.audio?.capture && !p.audio.capture.error) applyCapture(p.audio.capture);
    const missing = [];
    if (!(p.ring && p.ring.available)) missing.push("light ring");
    if (!(p.cyd && p.cyd.available)) missing.push("screen");
    if (!(p.state && p.state.available)) missing.push("saved settings");
    S.robot.missing = missing;
}
function applyCapture(c) {
    if (typeof c.stream_rate === "number") S.mic.rate = c.stream_rate;
    if (c.channel_mode) S.mic.channel = c.channel_mode;
    if ("hpf_mode" in c) S.mic.hpfOn = c.hpf_mode !== "off" && !!c.hpf_hz;
}
function applyVolume(r) {
    if (typeof r.volume === "number") S.sound.volume = r.volume;
    if (typeof r.muted === "boolean") S.sound.muted = r.muted;
}
async function readMixer() {
    const r = await send("audio.mixer.get");
    if (!r?.ok || !r.result) return;
    const c = r.result.controls || r.result;
    S.mic.missing = new Set();
    for (const [key, name] of Object.entries(MIXER)) {
        const n = parseInt(c[name], 10);
        if (Number.isFinite(n)) S.mic[key] = n;
        else S.mic.missing.add(key);
    }
}
function deviceName(r) {
    if (!r) return "";
    const first = (v) => Array.isArray(v) ? v[0] : v;
    const d = first(r.playback) || first(r.output) || first(r.devices);
    if (!d) return "";
    return typeof d === "string" ? d : d.name || d.description || JSON.stringify(d);
}
function renderRobotInfo() {
    const r = S.robot;
    $("#tbName").textContent = r.host ? `${r.host}:${r.port}` : "";
    $("#setHost").textContent = r.host || "—";
    $("#setPort").textContent = String(r.port || "—");
    $("#setVersion").textContent = r.version ? `rsc-host ${r.version}` : "unknown";
    $("#setBackend").textContent = !r.backend ? "unknown" : r.simulated ? "Simulated (rsc-host's fake backend)" : "Real robot";
    const chip = $("#tbReady");
    if (!r.status) { chip.className = "chip"; chip.textContent = "connecting"; chip.title = ""; }
    else if (r.simulated) { chip.className = "chip sim"; chip.textContent = "simulated"; chip.title = "rsc-host's fake backend: every command is answered, but no hardware moves"; }
    else if (r.missing.length) { chip.className = "chip warn"; chip.textContent = `no ${r.missing.join(", ")}`; chip.title = `Not available on this robot: ${r.missing.join(", ")}`; }
    else { chip.className = "chip ok"; chip.textContent = "ready"; chip.title = "Light ring, screen and saved settings all available"; }
}

// ---- Events from the robot ----
// Controls follow the robot, but not while you are dragging them yourself
const touched = {};
const fresh = (k) => performance.now() - (touched[k] || 0) < 700;
const flipEvent = (id) => (d) => {
    const k = "flip." + id;
    if (!fresh(k) && typeof d.speed === "number") robotSet(k, fromRobot(id, d.speed));
};
function volumeEvent(d) {
    if (!fresh("sound.volume") && typeof d.volume === "number") S.sound.volume = d.volume;
    if (typeof d.muted === "boolean") S.sound.muted = d.muted;
    render();
}
const powerEvent = (action) => (d) => {
    if (d.pending) C.expectClose = powerNote(action);
    else if (d.scheduled === false) C.expectClose = "";
};
const ON_EVENT = {
    "flipper.left.state": flipEvent("left"),
    "flipper.right.state": flipEvent("right"),
    "ring.mode": (d) => {
        S.ring.mode = d.mode || "off";
        // A colour someone else set: show it as it is, at full brightness
        const p = d.params || {};
        if (!fresh("ring") && ["r", "g", "b"].every((c) => typeof p[c] === "number")) {
            const mine = ringParams();
            if (p.r !== mine.r || p.g !== mine.g || p.b !== mine.b) Object.assign(S.ring, { r: p.r, g: p.g, b: p.b, level: 100 });
        }
        render();
    },
    "button_led.state": (d) => robotSet("led.mode", d.mode || "off"),
    "audio.volume": volumeEvent,
    "audio.mute": volumeEvent,
    "audio.mic_mute": (d) => { if (typeof d.mic_muted === "boolean") robotSet("mic.on", !d.mic_muted); },
    "system.reboot": powerEvent("reboot"),
    "system.poweroff": powerEvent("poweroff"),
};
const applyEvent = (topic, d) => ON_EVENT[topic]?.(d);
