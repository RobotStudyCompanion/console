// RSC Console · What each control sends to the robot; autosave, resets and presets.
"use strict";

// ---- Commands each control sends ----
const ringParams = () => {
    const k = S.ring.level / 100;
    return { r: Math.round(S.ring.r * k), g: Math.round(S.ring.g * k), b: Math.round(S.ring.b * k) };
};
const sendRing = () => send("ring.mode", S.ring.mode === "off" ? { mode: "off" } : { mode: S.ring.mode, params: Object.assign(ringParams(), { period_ms: 1500 }) });
// Changing the colour while the ring is off turns it on, so you see the colour you picked
function ringColourChanged() {
    touched.ring = performance.now();
    if (S.ring.mode === "off") S.ring.mode = "solid";
    syncRing();
    throttled("ring", sendRing);
}
function syncRing() {
    ["ring.mode", "ring.r", "ring.g", "ring.b", "ring.level"].forEach((k) => syncControls(k, null));
    $$('[data-k="ring.hex"]').forEach((el) => { el.value = ringHex(); });
}
const sendLed = () => send("button_led", S.led.mode in LED_PERIOD ? { mode: S.led.mode, params: { period_ms: LED_PERIOD[S.led.mode] } } : { mode: S.led.mode });
function sendFlip(id) {
    touched["flip." + id] = performance.now();
    return send("flipper." + id, { speed: toRobot(id, S.flip[id]) });
}
function setMood(m) {
    // The screen may be cycling even if this console never asked it to: that's its default, it's saved on the screen,
    // and the host can't report it. Turn it off every time, or the mood would last only until the next switch.
    send("cyd.mood_cycle", { value: "off" });
    if (S.face.cycle) { S.face.cycle = false; syncControls("face.cycle", null); }
    S.face.mood = m;
    rememberFace();
    return send("cyd.mood", { value: m });
}
// The screen runs on its own power supply, so after the robot shuts down it would keep showing a face. Freeze and blank it.
function blankScreen() {
    if (!supports("cyd.raw")) return;
    send("cyd.raw", { line: "pause" });
    send("cyd.raw", { line: "clear" });
    if (supports("cyd.led")) send("cyd.led", { value: "off" });
}
const sendTune = () => send("audio.capture.tune", Object.assign({ stream_rate: S.mic.rate, channel_mode: S.mic.channel }, S.mic.hpfOn ? { hpf_hz: 80 } : { hpf_mode: "off" }));
const setMixer = (key) => (S.mic.missing.has(key) ? null : send("audio.mixer.set", { name: MIXER[key], value: String(S.mic[key]) }));
const SEND = {
    "flip.left": () => sendFlip("left"),
    "flip.right": () => sendFlip("right"),
    // A new flipper speed applies straight away to a flipper that is already turning
    "ui.speed": () => {
        saveUI();
        for (const id of ["left", "right"]) {
            if (!S.flip[id]) continue;
            S.flip[id] = Math.sign(S.flip[id]) * SPEEDS[S.ui.speed];
            syncControls("flip." + id, null);
            sendFlip(id);
        }
    },
    "ui.dz.left": () => { saveUI(); if (S.flip.left) sendFlip("left"); },
    "ui.dz.right": () => { saveUI(); if (S.flip.right) sendFlip("right"); },
    "ring.mode": sendRing,
    "ring.r": ringColourChanged,
    "ring.g": ringColourChanged,
    "ring.b": ringColourChanged,
    "ring.level": ringColourChanged,
    "face.cycle": () => { send("cyd.mood_cycle", { value: S.face.cycle ? "on" : "off" }); updateSlots(); },
    "led.mode": sendLed,
    "sound.volume": () => send("audio.volume", { percent: S.sound.volume }),
    "sound.muted": () => send("audio.mute", { muted: S.sound.muted }),
    "mic.on": () => send("audio.mic_mute", { muted: !S.mic.on }),
    "mic.rate": () => send("audio.capture.tune", { stream_rate: S.mic.rate }),
    "mic.channel": () => send("audio.capture.tune", { channel_mode: S.mic.channel }),
    "mic.hpfOn": () => send("audio.capture.tune", S.mic.hpfOn ? { hpf_hz: 80 } : { hpf_mode: "off" }),
    "mic.boostL": () => setMixer("boostL"),
    "mic.boostR": () => setMixer("boostR"),
    "mic.capture": () => setMixer("capture"),
    "cal.us": () => { if (S.cal.holding) send("servo.hold", { id: S.cal.side, us: S.cal.us }); },
};

// ---- Saving, resets, presets ----
// What the robot can keep through a restart is saved automatically, a moment after the last change
const AUTOSAVE = new Set(["sound.volume", "mic.boostL", "mic.boostR", "mic.capture"]);
let saveT = null;
function autosave() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
        if (!C.connected) return;
        if (supports("audio.volume")) send("audio.volume", { percent: S.sound.volume, persist: true });
        if (supports("audio.mixer.store")) send("audio.mixer.store");
    }, 1500);
}
const RESET = {
    movement: () => {
        if (S.cal.holding) { S.cal.holding = false; send("servo.hold.stop", {}, { urgent: true }); }
        S.flip.left = 0; S.flip.right = 0;
        send("flipper.stop_all", {}, { urgent: true });
    },
    light: () => { Object.assign(S.ring, DEFAULTS.ring); sendRing(); },
    face: () => { setMood(DEFAULTS.face.mood); },
    led: () => { S.led.mode = DEFAULTS.led.mode; sendLed(); },
    sound: () => {
        Object.assign(S.sound, clone(DEFAULTS.sound));
        send("audio.volume", { percent: S.sound.volume });
        send("audio.mute", { muted: false });
        autosave();
    },
    mic: () => {
        const { on, rate, channel, hpfOn } = DEFAULTS.mic;
        Object.assign(S.mic, { on, rate, channel, hpfOn });
        send("audio.mic_mute", { muted: false });
        sendTune();
        // The robot knows its shipped mixer values; read them back rather than guess
        send("audio.mixer.reset").then(() => readMixer()).then(() => { refreshPanel(); afterChange(); autosave(); });
    },
};
const snapshot = () => ({
    ring: clone(S.ring), led: { mode: S.led.mode }, face: { mood: S.face.mood },
    sound: { volume: S.sound.volume, muted: S.sound.muted, playback: S.sound.playback, normalise: S.sound.normalise },
    mic: { on: S.mic.on, rate: S.mic.rate, channel: S.mic.channel, hpfOn: S.mic.hpfOn, boostL: S.mic.boostL, boostR: S.mic.boostR, capture: S.mic.capture },
});
function applySnap(s) {
    // Presets saved before the ring had a colour carry only its mode
    Object.assign(S.ring, DEFAULTS.ring, s.ring);
    S.led.mode = s.led.mode;
    Object.assign(S.sound, s.sound);
    Object.assign(S.mic, s.mic);
    sendRing();
    sendLed();
    if (s.face.mood) setMood(s.face.mood);
    send("audio.volume", { percent: S.sound.volume });
    send("audio.mute", { muted: S.sound.muted });
    send("audio.mic_mute", { muted: !S.mic.on });
    sendTune();
    ["boostL", "boostR", "capture"].forEach(setMixer);
    autosave();
}
let PRESETS = store.get(K.presets, []);
if (!Array.isArray(PRESETS)) PRESETS = [];
const presetMenuHTML = () => `<button type="button" class="pop-item" role="menuitem" data-act="applyPreset:default">Default</button>
    ${PRESETS.map((p, i) => `<button type="button" class="pop-item" role="menuitem" data-act="applyPreset:${i}">${esc(p.name)}</button>`).join("")}
    <div class="menu-sep"></div>
    <button type="button" class="pop-item" role="menuitem" data-act="savePreset"><svg class="ic"><use href="#i-plus"/></svg>Save current settings as a preset…</button>`;
function setPresetMenu(open) {
    const pop = $("#presetPop"), b = $("#presetBtn");
    if (!pop) return;
    if (open) pop.innerHTML = presetMenuHTML();
    pop.hidden = !open;
    b.setAttribute("aria-expanded", String(open));
}
