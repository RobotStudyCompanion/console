// RSC Console · The single state object S, its path helpers, and the flipper dead-zone mapping.
"use strict";

// ---- State ----
// Everything this console knows about one robot. Made fresh on every connect, so nothing carries over
// from the robot before; syncFromRobot() then fills in what the robot reports.
function robotState(host = "", port = 8765) {
    return {
        robot: { host, port, version: "", backend: "", simulated: false, verbs: new Set(), missing: [], status: false, powerAllowed: false, powerReason: "", powerFix: "" },
        flip: { left: 0, right: 0 },
        ring: clone(DEFAULTS.ring),
        led: clone(DEFAULTS.led),
        // What the screen shows, as the host reports it (cyd.state); null: not known. reports: false means the screen's
        // firmware doesn't report, so these are only what was last sent to it.
        face: { mood: null, cycle: null, reports: false },
        diag: {},
        sound: Object.assign(clone(DEFAULTS.sound), { running: false, device: "", result: null, error: "" }),
        // The mixer values are shown until the robot's own are read
        mic: Object.assign(clone(DEFAULTS.mic), { boostL: 2, boostR: 2, capture: 28, missing: new Set() }),
        cal: { side: "left", holding: false, us: 1500, stored: { left: null, right: null } },
    };
}
// The rest is this browser's own: the page, the layout, and the chat and onboarding settings (only in this
// browser until the robot has chat, step 3, and onboarding, step 8)
const S = Object.assign({
    view: "connect",
    ui: Object.assign({ sel: "movement", theme: "auto", adv: {}, speed: "medium", dz: {} }, store.get(K.ui, {})),
    dock: Object.assign({ state: "open", w: 380, h: 240, filter: "all" }, store.get(K.log, {})),
    prefs: Object.assign({ systemPrompt: "", onboarding: true }, store.get(K.prefs, {})),
}, robotState());
if (!S.ui.adv || typeof S.ui.adv !== "object") S.ui.adv = {};
// Dead zone per flipper, in percent of full speed: below it the servo doesn't turn (left span 100 µs → 25 % is 25 µs)
S.ui.dz = Object.assign({ left: 25, right: 25 }, S.ui.dz);
if (!SPEEDS[S.ui.speed]) S.ui.speed = "medium";
if (S.dock.state !== "closed") S.dock.state = "open";
S.dock.w = clamp(Number(S.dock.w) || 380, 280, 640);
S.dock.h = clamp(Number(S.dock.h) || 240, 140, 600);
let logBodyOpen = false, logExpanded = false;
// A control's key is its path in S, like "sound.volume"
const getPath = (k) => k.split(".").reduce((o, p) => o[p], S);
const setPath = (k, v) => { const ps = k.split("."); const last = ps.pop(); ps.reduce((o, p) => o[p], S)[last] = v; };
const saveUI = () => store.set(K.ui, S.ui);
const savePrefs = () => store.set(K.prefs, S.prefs);

// Flipper sliders cover only the range where the servo actually turns: 1 % on the slider is just past the dead zone.
// The robot reports raw speeds; anything inside the dead zone shows as stopped, because the flipper is.
function toRobot(id, v) {
    if (!v) return 0;
    const dz = S.ui.dz[id];
    return Math.sign(v) * +((dz + Math.abs(v) * (100 - dz) / 100) / 100).toFixed(3);
}
function fromRobot(id, speed) {
    const p = Math.abs(speed) * 100, dz = S.ui.dz[id];
    if (p <= dz) return 0;
    return Math.sign(speed) * Math.round((p - dz) / (100 - dz) * 100);
}
// The mood whose button is pressed: none while the screen cycles without reporting which mood it shows
const shownMood = () => (S.face.cycle && !S.face.reports ? null : S.face.mood);
