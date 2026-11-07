// RSC Console · Fixed data: storage keys, verbs, ring colours, moods and faces, defaults, which verb each control needs.
"use strict";

// localStorage keys. The first two come from the old single-file console and
// are kept, so robots and tokens saved there still show up.
const K = {
    known: "rsc.known_robots",
    token: (host) => "rsc.token." + host,
    recent: "rsc.app.recent",
    ui: "rsc.app.ui",
    log: "rsc.app.log",
    presets: "rsc.app.presets",
    chats: "rsc.app.chats",
    face: "rsc.app.face",
    prefs: "rsc.app.prefs",
};

// Verbs at host 3337185 (host.md §2.4). Only a fallback for the custom command
// list: once connected, the robot's own `status.verbs` is used.
const VERBS = ["ping", "status", "events.history", "flipper.left", "flipper.right", "flipper.m3", "flipper.left.stop", "flipper.right.stop", "flipper.m3.stop", "flipper.stop_all",
    "servo.calibration", "servo.hold", "servo.hold.stop", "servo.calibration.store", "servo.calibration.reset", "servo.calibrate", "ring.mode", "ring.off", "ring.modes", "ring.status",
    "button_led", "cyd.mood", "cyd.theme", "cyd.bright", "cyd.eye_colour", "cyd.bg_colour", "cyd.led", "cyd.blink", "cyd.splash", "cyd.face", "cyd.look", "cyd.mood_cycle", "cyd.raw",
    "audio.play_url", "audio.stop_play", "audio.capture.stop", "audio.devices", "audio.selftest", "audio.capture.config", "audio.capture.tune", "audio.capture.stats", "audio.capture.stats.reset",
    "audio.mixer.get", "audio.mixer.set", "audio.mixer.preset", "audio.mixer.store", "audio.mixer.reset", "audio.volume", "audio.volume.get", "audio.mute", "audio.mic_mute",
    "system.power_status", "system.poweroff", "system.reboot", "peripherals.status"];

// One colour for every ring pattern, scaled by the brightness before it is sent
const RING_MODES = [["off", "Off"], ["solid", "Solid"], ["pulse", "Pulse"], ["spin", "Spin"]];
const SWATCHES = [["Red", 255, 0, 0], ["Orange", 255, 100, 0], ["Yellow", 255, 200, 0], ["Green", 0, 255, 40], ["Cyan", 0, 200, 255],
    ["Blue", 0, 80, 255], ["Purple", 150, 0, 255], ["Pink", 255, 0, 120], ["White", 255, 255, 255]];

// The button LED's pulse and breathe are both smooth fades on the robot; different speeds tell them apart
const LED_PERIOD = { pulse: 800, breathe: 4000 };

// The moods the screen's firmware knows (RobotStudyCompanion/cyd), drawn on the robot and on the buttons
const MOODS = [["NEUTRAL", "Neutral"], ["HAPPY", "Happy"], ["SAD", "Sad"], ["ANGRY", "Angry"], ["EXCITED", "Excited"], ["ANNOYED", "Annoyed"], ["QUESTIONING", "Questioning"]];
// The screen draws only two eyes, no mouth (the Grobot_Animations library the firmware uses). Each eye is a ring
// (eye radius, pupil hole radius) cut by a top lid that can slant (top lid height, tilt) and a bottom lid
// (bottom lid height), in the library's units: [topH, botH, tilt, pupil, radius]. These are the numbers
// in v0.1.3, the version the firmware names (setEmotion); v0.1.4 removed the named moods. QUESTIONING has a
// different left and right eye.
const EYES = {
    NEUTRAL: [0, 0, 0, 30, 45],
    HAPPY: [0, 50, 0, 30, 45],
    SAD: [0, 0, -60, 27, 45],
    ANGRY: [0, 0, 60, 30, 45],
    EXCITED: [0, 0, 0, 23, 45],
    ANNOYED: [0, 35, 25, 0, 45],
    QUESTIONING: { l: [0, 0, 0, 30, 45], r: [50, 0, 0, 30, 45] },
};
const moodName = (m) => (MOODS.find(([v]) => v === m) || [m, m])[1];

// Flipper buttons spin at one of these speeds, in percent of the usable range
const SPEEDS = { slow: 30, medium: 60, fast: 100 };

// What Reset goes back to. The mixer's and the calibration's own resets restore what the robot shipped with.
const DEFAULTS = {
    ring: { mode: "off", r: 0, g: 80, b: 255, level: 60 },
    led: { mode: "off" },
    face: { mood: "HAPPY" },
    sound: { volume: 50, muted: false, playback: true, normalise: true },
    mic: { on: true, rate: 48000, channel: "left", hpfOn: true, boostL: 2, boostR: 2, capture: 28 },
};

const MIXER = { boostL: "Left Input Boost Mixer LINPUT1", boostR: "Right Input Boost Mixer RINPUT1", capture: "Capture" };

// Which verb each control needs, so controls the robot's daemon lacks are disabled instead of failing
const NEEDS_KEY = {
    "flip.left": "flipper.left", "flip.right": "flipper.right", "ring.mode": "ring.mode", "led.mode": "button_led",
    "ring.r": "ring.mode", "ring.g": "ring.mode", "ring.b": "ring.mode", "ring.level": "ring.mode", "ring.hex": "ring.mode", "face.cycle": "cyd.mood_cycle",
    "sound.volume": "audio.volume", "sound.muted": "audio.mute", "sound.playback": "audio.selftest", "sound.normalise": "audio.selftest",
    "mic.on": "audio.mic_mute", "mic.rate": "audio.capture.tune", "mic.channel": "audio.capture.tune", "mic.hpfOn": "audio.capture.tune",
    "mic.boostL": "audio.mixer.set", "mic.boostR": "audio.mixer.set", "mic.capture": "audio.mixer.set", "cal.side": "servo.hold", "cal.us": "servo.hold",
};
const NEEDS_ACT = {
    mood: "cyd.mood", blink: "cyd.blink", ringColour: "ring.mode", runTest: "audio.selftest", stopPlay: "audio.stop_play",
    mixerReset: "audio.mixer.reset", calStart: "servo.hold", calSave: "servo.calibrate", calRelease: "servo.hold.stop", calReset: "servo.calibration.reset",
    quickMute: "audio.mute", quickMic: "audio.mic_mute", stopAll: "flipper.stop_all",
};
