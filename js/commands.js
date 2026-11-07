// RSC Console · What each control sends to the robot (CONTROLS); autosave, resets and presets.
"use strict";

// ---- Commands ----
const ringParams = () => {
    const k = S.ring.level / 100;
    return { r: Math.round(S.ring.r * k), g: Math.round(S.ring.g * k), b: Math.round(S.ring.b * k) };
};
const sendRing = () => send("ring.mode", S.ring.mode === "off" ? { mode: "off" } : { mode: S.ring.mode, params: Object.assign(ringParams(), { period_ms: 1500 }) });
// Changing the colour while the ring is off turns it on, so you see the colour you picked
function sendRingColour() {
    if (S.ring.mode === "off") S.ring.mode = "solid";
    sendRing();
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
    S.face.cycle = false;
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
// The robot knows its shipped mixer values; read them back rather than guess
const resetMixer = () => send("audio.mixer.reset").then(() => readMixer()).then(render);
// Stops both flippers on the stop socket, and lets go of this console's calibration hold
function stopMotion() {
    if (S.cal.holding) { S.cal.holding = false; send("servo.hold.stop", {}, { urgent: true }); }
    S.flip.left = 0;
    S.flip.right = 0;
    return send("flipper.stop_all", {}, { urgent: true });
}

// ---- Controls ----
// One entry per control, keyed by its path in S (the data-k of its inputs). Every field is optional:
//   verb     the verb it needs; without it the control is disabled
//   apply()  what happens after its value changes, usually a command
//   keep     the robot keeps the value through a restart, so save it there (autosave)
//   group    changes in one group share a throttle and count as "touched" together (default: the key)
//   snap     a slider within this distance of 0 snaps to 0
//   get/set  for a control that isn't a plain path in S
//   off()    why it's unavailable right now: a reason for its tooltip, true for none, or false/"" when it's available
const ringColour = { verb: "ring.mode", group: "ring", apply: sendRingColour };
const mixerControl = (key) => ({ verb: "audio.mixer.set", keep: true, apply: () => setMixer(key), off: () => S.mic.missing.has(key) && "This robot's sound card has no such mixer control" });
const CONTROLS = {
    "flip.left": { verb: "flipper.left", snap: 4, apply: () => sendFlip("left") },
    "flip.right": { verb: "flipper.right", snap: 4, apply: () => sendFlip("right") },
    // A new flipper speed applies straight away to a flipper that is already turning
    "ui.speed": {
        apply: () => {
            saveUI();
            for (const id of ["left", "right"]) {
                if (!S.flip[id]) continue;
                S.flip[id] = Math.sign(S.flip[id]) * SPEEDS[S.ui.speed];
                sendFlip(id);
            }
        },
    },
    "ui.dz.left": { apply: () => { saveUI(); if (S.flip.left) sendFlip("left"); } },
    "ui.dz.right": { apply: () => { saveUI(); if (S.flip.right) sendFlip("right"); } },
    "cal.side": { verb: "servo.hold", off: () => S.cal.holding },
    "cal.us": { verb: "servo.hold", off: () => !S.cal.holding, apply: () => { if (S.cal.holding) send("servo.hold", { id: S.cal.side, us: S.cal.us }); } },
    "ring.mode": { verb: "ring.mode", group: "ring", apply: sendRing },
    "ring.r": ringColour,
    "ring.g": ringColour,
    "ring.b": ringColour,
    "ring.level": ringColour,
    "ring.hex": {
        ...ringColour,
        get: ringHex,
        set: (hex) => { const n = parseInt(hex.slice(1), 16); Object.assign(S.ring, { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }); },
    },
    "face.cycle": { verb: "cyd.mood_cycle", apply: () => send("cyd.mood_cycle", { value: S.face.cycle ? "on" : "off" }) },
    "led.mode": { verb: "button_led", apply: sendLed },
    "sound.volume": { verb: "audio.volume", keep: true, apply: () => send("audio.volume", { percent: S.sound.volume }) },
    "sound.muted": { verb: "audio.mute", apply: () => send("audio.mute", { muted: S.sound.muted }) },
    "sound.playback": { verb: "audio.selftest" },
    "sound.normalise": { verb: "audio.selftest", off: () => !S.sound.playback },
    "mic.on": { verb: "audio.mic_mute", apply: () => send("audio.mic_mute", { muted: !S.mic.on }) },
    "mic.rate": { verb: "audio.capture.tune", apply: () => send("audio.capture.tune", { stream_rate: S.mic.rate }) },
    "mic.channel": { verb: "audio.capture.tune", apply: () => send("audio.capture.tune", { channel_mode: S.mic.channel }) },
    "mic.hpfOn": { verb: "audio.capture.tune", apply: () => send("audio.capture.tune", S.mic.hpfOn ? { hpf_hz: 80 } : { hpf_mode: "off" }) },
    "mic.boostL": mixerControl("boostL"),
    "mic.boostR": mixerControl("boostR"),
    "mic.capture": mixerControl("capture"),
    // Settings page: kept in this browser
    "ui.theme": { apply: () => { saveUI(); applyTheme(); } },
    "prefs.systemPrompt": { apply: savePrefs },
    "prefs.onboarding": { apply: savePrefs },
};

// ---- Saving, resets, presets ----
// What the robot can keep through a restart is saved automatically, a moment after the last change
let saveT = null;
function autosave() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
        if (!C.connected) return;
        if (supports("audio.volume")) send("audio.volume", { percent: S.sound.volume, persist: true });
        if (supports("audio.mixer.store")) send("audio.mixer.store");
    }, 1500);
}
onDisconnect.push(() => clearTimeout(saveT));

// A preset holds one entry per part in DEFAULTS, plus the mixer values. Each part is sent by its APPLY,
// which gets the part as it was saved; the mic resets the mixer to the robot's own values when that has none.
const APPLY = {
    ring: sendRing,
    led: sendLed,
    face: () => { if (S.face.mood) setMood(S.face.mood); },
    sound: () => {
        send("audio.volume", { percent: S.sound.volume });
        send("audio.mute", { muted: S.sound.muted });
        autosave();
    },
    mic: (saved) => {
        send("audio.mic_mute", { muted: !S.mic.on });
        sendTune();
        if (Object.keys(MIXER).some((k) => k in saved)) Object.keys(MIXER).forEach(setMixer);
        else resetMixer();
        autosave();
    },
};
function snapshot() {
    const snap = Object.fromEntries(Object.entries(DEFAULTS).map(([part, d]) => [part, Object.fromEntries(Object.keys(d).map((k) => [k, S[part][k]]))]));
    for (const k of Object.keys(MIXER)) snap.mic[k] = S.mic[k];
    // A face this console doesn't know isn't saved, so the preset leaves the face alone
    if (!S.face.mood) delete snap.face;
    return snap;
}
// Fields a saved part lacks (older presets) come from DEFAULTS
function applySnap(snap) {
    for (const part of Object.keys(DEFAULTS)) {
        if (!snap[part]) continue;
        Object.assign(S[part], DEFAULTS[part], snap[part]);
        APPLY[part](snap[part]);
    }
}
const resetTo = (part) => () => applySnap({ [part]: clone(DEFAULTS[part]) });
// One reset per console section
const RESET = { movement: stopMotion, light: resetTo("ring"), face: resetTo("face"), led: resetTo("led"), sound: resetTo("sound"), mic: resetTo("mic") };
// Reset everything is the Default preset with the flippers stopped
function resetAll() {
    stopMotion();
    applySnap(clone(DEFAULTS));
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
Object.assign(ACTIONS, {
    presets: { run: () => setPresetMenu($("#presetPop").hidden) },
    applyPreset: {
        run: (arg) => {
            const p = arg === "default" ? { name: "Default", snap: clone(DEFAULTS) } : PRESETS[Number(arg)];
            setPresetMenu(false);
            if (!p) return;
            applySnap(p.snap);
            render();
            flash($("#presetBtn"), p.name);
        },
    },
    savePreset: {
        run: () => {
            $("#presetName").value = "";
            $("#presetErr").hidden = true;
            openModal("#presetBg", "#presetName");
        },
    },
    closePreset: { run: () => { $("#presetBg").hidden = true; } },
});
$("#presetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#presetName").value.trim();
    if (!name) { $("#presetErr").textContent = "Give the preset a name."; $("#presetErr").hidden = false; $("#presetName").focus(); return; }
    const at = PRESETS.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    const p = { name, snap: snapshot() };
    if (at >= 0) PRESETS[at] = p; else PRESETS.push(p);
    store.set(K.presets, PRESETS);
    $("#presetBg").hidden = true;
    flash($("#presetBtn"), at >= 0 ? `Updated "${name}"` : `Saved "${name}"`);
});
