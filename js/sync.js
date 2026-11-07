// RSC Console · Reading the robot after connecting, and following its events.
"use strict";

// ---- Reading the robot's state after connecting ----
async function syncFromRobot() {
    const st = await request("status");
    if (st?.ok) {
        S.robot.version = st.result?.version || "";
        S.robot.verbs = new Set(st.result?.verbs || []);
    }
    const ps = await request("peripherals.status");
    if (ps?.ok && ps.result) applyPeripherals(ps.result);
    S.robot.status = true;
    if (!S.robot.simulated && supports("system.power_status")) {
        const pw = await request("system.power_status");
        S.robot.powerAllowed = !!(pw?.ok && pw.result?.allowed);
        S.robot.powerReason = pw?.result?.reason || "";
        S.robot.powerFix = pw?.result?.fix || "";
    }
    if (supports("audio.volume.get")) {
        const v = await request("audio.volume.get");
        if (v?.ok && v.result) applyVolume(v.result);
    }
    if (supports("audio.mixer.get")) await readMixer();
    if (supports("audio.devices")) {
        const d = await request("audio.devices");
        if (d?.ok) S.sound.device = deviceName(d.result);
    }
    // The screen has its own power supply, so it stays blank after a shutdown from this console until something wakes it
    if (!S.robot.simulated && supports("cyd.raw")) request("cyd.raw", { line: "resume" });
    renderRobotInfo();
    refreshPanel();
    afterChange();
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
    const r = await request("audio.mixer.get");
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
function applyEvent(topic, d) {
    const m = topic.match(/^flipper\.(left|right)\.state$/);
    if (m) {
        const k = "flip." + m[1];
        if (!fresh(k) && typeof d.speed === "number") { S.flip[m[1]] = fromRobot(m[1], d.speed); syncControls(k, null); }
    } else if (topic === "ring.mode") {
        S.ring.mode = d.mode || "off";
        // A colour someone else set: show it as it is, at full brightness
        const p = d.params || {};
        if (!fresh("ring") && ["r", "g", "b"].every((c) => typeof p[c] === "number")) {
            const mine = ringParams();
            if (p.r !== mine.r || p.g !== mine.g || p.b !== mine.b) Object.assign(S.ring, { r: p.r, g: p.g, b: p.b, level: 100 });
        }
        syncRing();
    } else if (topic === "button_led.state") {
        S.led.mode = d.mode || "off";
        syncControls("led.mode", null);
    } else if (topic === "audio.volume" || topic === "audio.mute") {
        if (!fresh("sound.volume") && typeof d.volume === "number") { S.sound.volume = d.volume; syncControls("sound.volume", null); }
        if (typeof d.muted === "boolean") { S.sound.muted = d.muted; syncControls("sound.muted", null); }
    } else if (topic === "audio.mic_mute") {
        if (typeof d.mic_muted === "boolean") { S.mic.on = !d.mic_muted; syncControls("mic.on", null); }
    } else if (topic === "system.reboot" || topic === "system.poweroff") {
        if (d.pending) C.expectClose = topic === "system.reboot" ? `${S.robot.host} is restarting. It should be back in about a minute.` : `${S.robot.host} is shutting down. Someone has to reach its power supply to start it again.`;
        else if (d.scheduled === false) C.expectClose = "";
        return;
    } else return;
    afterChange();
}
