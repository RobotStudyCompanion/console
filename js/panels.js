// RSC Console · The control panel for each part of the robot, and the checks: asking, their answers, custom commands.
"use strict";

// ---- Sections: everyday controls first, Advanced folded at the bottom ----
const verbOptions = () => (S.robot.verbs.size ? [...S.robot.verbs].sort() : VERBS).map((v) => `<option${v === "servo.calibrate" ? " selected" : ""}>${esc(v)}</option>`).join("");
const flipButtons = (id) => `<div class="row flip-btns" role="group" aria-label="${id === "left" ? "Left" : "Right"} flipper">${btn(`flip:${id}:-1`, "Reverse", "sm")}${btn(`flip:${id}:0`, "Stop", "sm")}${btn(`flip:${id}:1`, "Forward", "sm")}</div>`;
const diagSlot = (sec) => `<div data-slot="diag" data-sec="${sec}">${diagHTML(sec)}</div>`;
const rgbHex = (r, g, b) => "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
const ringHex = () => rgbHex(S.ring.r, S.ring.g, S.ring.b);
const SECTIONS = [
    { id: "movement", name: "Movement", render: () => `<div class="stack">
        ${box(slider("flip.left", "Left flipper", { min: -100, max: 100, step: 1, bipolar: true, labels: ["Reverse", "Stop", "Forward"] }), flipButtons("left"),
            slider("flip.right", "Right flipper", { min: -100, max: 100, step: 1, bipolar: true, labels: ["Reverse", "Stop", "Forward"] }), flipButtons("right"))}
        ${seg("ui.speed", "Flipper speed", [["slow", "Slow"], ["medium", "Medium"], ["fast", "Fast"]])}
        ${adv("movement", `<p class="sub">Dead zone</p>
            ${hint("A flipper doesn't turn at very low speeds. The slider skips that range, so its first step already moves the flipper. Raise this if a flipper stays still at slow speeds, lower it if Slow is too fast.")}
            ${box(slider("ui.dz.left", "Left flipper", { min: 0, max: 60, step: 1, unit: "%" }), slider("ui.dz.right", "Right flipper", { min: 0, max: 60, step: 1, unit: "%" }))}
            <p class="sub">Flipper calibration</p>
            ${hint("Use this when a flipper creeps while it should stand still. Pick a side and start holding, drag until that flipper stops moving, then save.")}
            ${box(seg("cal.side", "Flipper", [["left", "Left"], ["right", "Right"]]),
                `<div class="readout" data-slot="calStored">${calStored()}</div>`,
                slider("cal.us", "Pulse width", { min: 1400, max: 1600, step: 1, unit: "µs" }))}
            <div class="row">${btn("calStart", "Start holding")}${btn("calSave", "Save as still point", "primary")}${btn("calRelease", "Release")}</div>
            <div class="row">${btn("diag:servo.calibration", "Read stored values", "sm")}${btn("calReset", "Reset to shipped values", "sm ghost")}</div>
            ${diagSlot("movement")}`)}</div>` },
    { id: "light", name: "Light ring", render: () => `<div class="stack">
        ${seg("ring.mode", "Pattern", RING_MODES)}
        <div class="field"><span class="field-label">Colour</span><div class="swatches">${SWATCHES.map(([n, r, g, b]) =>
            `<button type="button" class="swatch" data-act="ringColour:${r},${g},${b}" style="--sw: rgb(${r} ${g} ${b})" aria-label="${n}" title="${n}"></button>`).join("")}<label class="swatch pick" title="Any colour"><input type="color" data-k="ring.hex" value="${ringHex()}" aria-label="Pick any colour"></label></div></div>
        ${box(slider("ring.r", "Red", { min: 0, max: 255, step: 1 }), slider("ring.g", "Green", { min: 0, max: 255, step: 1 }), slider("ring.b", "Blue", { min: 0, max: 255, step: 1 }),
            slider("ring.level", "Brightness", { min: 5, max: 100, step: 1, unit: "%" }))}
        ${adv("light", checks(
            check("diag:ring.status", "Ring status", "Whether the light ring is connected and working"),
            check("diag:ring.modes", "Patterns", "The light patterns this robot knows")) + diagSlot("light"))}</div>` },
    { id: "face", name: "Face", render: () => `<div class="stack">
        <div class="field"><span class="field-label">Expression</span><div class="expr">
            ${MOODS.map(([v, t]) => `<button type="button" data-act="mood:${v}" data-mood="${v}" aria-pressed="${!S.face.cycle && S.face.mood === v}">${faceGlyph(v)}${t}</button>`).join("")}
            <button type="button" data-act="blink">${GLYPH.blink}Blink</button>
        </div></div>
        ${box(toggle("face.cycle", "Cycle through all moods"))}</div>` },
    { id: "led", name: "Button light", render: () => `<div class="stack">
        ${seg("led.mode", "Mode", [["off", "Off"], ["on", "On"], ["pulse", "Pulse"], ["breathe", "Breathe"]])}
        ${hint("Pulse fades in and out quickly, about once a second. Breathe rises and falls slowly, every 4 seconds.")}</div>` },
    { id: "sound", name: "Sound", render: () => `<div class="stack">
        ${box(slider("sound.volume", "Volume", { min: 0, max: 100, step: 1, unit: "%" }), toggle("sound.muted", "Mute speaker"))}
        <p class="sub">Speaker and microphone test</p>
        ${hint("Records 3 seconds, then plays the recording back. Speak while it records.")}
        <div class="row">${btn("runTest", "Run test", "primary")}</div>
        <div data-slot="testResult">${testResult()}</div>
        ${adv("sound", `${box(toggle("sound.playback", "Play the recording back"),
                toggle("sound.normalise", "Play it back at a comfortable level"),
                hint("Turn this off to hear the raw recording, which is usually very quiet."))}
            <div class="row">${btn("stopPlay", "Stop playback")}</div>
            ${S.sound.device ? `<div class="device"><svg class="ic"><use href="#i-speaker"/></svg><code>${esc(S.sound.device)}</code></div>` : ""}
            ${checks(
                check("diag:audio.volume.get", "Volume", "The volume and mute state the robot reports"),
                check("diag:audio.devices", "Audio devices", "The sound cards the robot can see"))}
            ${diagSlot("sound")}`)}</div>` },
    { id: "mic", name: "Microphone", render: () => `<div class="stack">
        ${box(toggle("mic.on", "Microphone on"), hint("Off disconnects the microphone in hardware."))}
        ${adv("mic", `${seg("mic.rate", "Stream rate", [[16000, "16 kHz"], [48000, "48 kHz"]])}
            ${hint("48 kHz is the default. 16 kHz can sound garbled on current robots.")}
            ${seg("mic.channel", "Channel", [["left", "Left"], ["right", "Right"]])}
            ${box(toggle("mic.hpfOn", "High-pass filter at 80 Hz"), hint("Cuts low rumble, like desk knocks and fan noise."))}
            <p class="sub">Mixer</p>
            ${box(slider("mic.boostL", "Input boost, left", { min: 0, max: 3, step: 1 }),
                slider("mic.boostR", "Input boost, right", { min: 0, max: 3, step: 1 }),
                hint("Input boost makes the microphone more sensitive before the sound is digitised. Raise it first if the robot can't hear you."),
                slider("mic.capture", "Capture gain", { min: 0, max: 63, step: 1 }),
                hint("Capture gain is a digital volume applied afterwards. It makes your voice and the background noise louder alike."))}
            <div class="row">${btn("mixerReset", "Reset to shipped default", "ghost")}</div>
            ${checks(
                check("diag:audio.capture.config", "Recording settings", "How the robot is recording right now"),
                check("diag:audio.capture.stats", "Recording levels", "Input and output levels since the last reset"),
                check("diag:audio.capture.stats.reset", "Reset levels", "Start measuring the levels again", "Reset"),
                check("diag:audio.mixer.get", "Mixer values", "Every mixer setting and its value"))}
            ${diagSlot("mic")}`)}</div>` },
    { id: "advanced", name: "Advanced", render: () => `<div class="stack">
        <p class="sub">Checks</p>
        ${hint("Each check asks the robot a question. The answer appears below, and in the log.")}
        ${checks(
            check("diag:ping", "Ping", "Is the robot answering?"),
            check("diag:status", "Robot info", "Software version and the commands this robot understands"),
            check("diag:peripherals.status", "Hardware check", "Which parts are working: flippers, light ring, screen, audio"),
            check("diag:events.history", "Recent events", "The last 20 things the robot reported, like a button press or a flipper stopping"))}
        <p class="sub">Custom command</p>
        ${hint("Sends any command the robot understands, with your own values.")}
        ${box(`<div class="field"><label for="c-custom-verb">Command</label><select id="c-custom-verb">${verbOptions()}</select></div>`,
            `<div class="field"><label for="c-custom-args">Arguments (JSON)</label><textarea id="c-custom-args" rows="3" spellcheck="false" placeholder='{"id": "right", "null_us": 1510}'></textarea></div>`,
            `<p class="form-err" data-slot="customErr" hidden></p>`)}
        <div class="row">${btn("customSend", "Send", "primary")}</div>
        ${diagSlot("advanced")}</div>` },
];
const secById = (id) => SECTIONS.find((s) => s.id === id) || SECTIONS[0];

const dbfs = (v) => minus(+v.toFixed(1)) + " dBFS";
const barPct = (db) => clamp((db + 60) / 60 * 100, 0, 100).toFixed(1);
function testResult() {
    if (S.sound.running) return `<p class="working">Recording for 3 s. Speak now.</p>`;
    if (S.sound.error) return `<p class="form-err">${esc(S.sound.error)}</p>`;
    const r = S.sound.result;
    if (!r) return "";
    const verdict = r.rms < -60 ? "Silent: the microphone isn't hearing you" : r.rms < -45 ? "Quiet: speak closer, or raise the input boost" : r.rms > -12 ? "Very loud: lower the capture gain" : "Healthy";
    return `<div class="meters"><span class="cap">Last test: ${verdict}${r.clipped ? `. ${r.clipped} samples clipped: lower the capture gain` : ""}</span>
        <div class="meter"><span>Peak</span><div class="bar"><i style="width:${barPct(r.peak)}%"></i></div><code>${dbfs(r.peak)}</code></div>
        <div class="meter"><span>RMS</span><div class="bar"><i style="width:${barPct(r.rms)}%"></i></div><code>${dbfs(r.rms)}</code></div>
        <div class="meter scale"><span></span><span><span>${minus(-60)}</span><span>${minus(-30)}</span><span>0 dBFS</span></span><span></span></div></div>`;
}
function calStored() {
    const us = (v) => (v == null ? "?" : v);
    return (S.cal.holding ? `<span class="hold">Holding the ${S.cal.side} flipper. Release when you're done.</span>` : "") +
        `Stored still point <code>L ${us(S.cal.stored.left)} µs</code><code>R ${us(S.cal.stored.right)} µs</code>`;
}
// A check's answer, shown under the checks: every value with its path, and the raw reply folded away
function flatten(v, path, rows) {
    if (rows.length >= 300) return rows;
    if (v === null || typeof v !== "object") rows.push([path || "value", v === null ? "none" : String(v)]);
    else if (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object")) rows.push([path, v.length ? v.join(", ") : "none"]);
    else if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${path}[${i}]`, rows));
    else if (!Object.keys(v).length) rows.push([path || "value", "none"]);
    else for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, rows);
    return rows;
}
// Built once per answer and kept on it, since render() asks for it on every change
function diagHTML(sec) {
    const d = S.diag[sec];
    if (!d) return "";
    return d.html ??= answerHTML(sec, d);
}
function answerHTML(sec, d) {
    const head = (chip) => `<div class="result-head"><code>${esc(d.verb)}</code>${chip}<button type="button" class="icon-btn sm" data-act="diagClear:${sec}" aria-label="Hide this answer" title="Hide"><svg class="ic"><use href="#i-x"/></svg></button></div>`;
    if (d.waiting) return `<div class="result">${head('<span class="chip">asking…</span>')}</div>`;
    const a = d.ack;
    if (!a) return `<div class="result">${head('<span class="chip warn">no answer</span>')}<p class="dim">The connection closed before the robot answered.</p></div>`;
    if (!a.ok) return `<div class="result">${head('<span class="chip warn">error</span>')}<p class="form-err">${esc(a.code || "error")}${a.message ? `: ${esc(a.message)}` : ""}</p></div>`;
    const r = a.result;
    let rows;
    if (d.verb === "events.history" && Array.isArray(r?.events)) rows = r.events.map((e) => [`#${e.seq} ${e.topic}`, JSON.stringify(e.data ?? {})]);
    else rows = r == null ? [] : flatten(r, "", []);
    const body = rows.length
        ? `<table class="kv-table"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="dim">Done. The robot sent no data back.</p>`;
    return `<div class="result">${head('<span class="chip ok">OK</span>')}${body}${r == null ? "" : `<details class="raw"><summary>Raw reply</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details>`}</div>`;
}
// The answer shows in the panel that was open when you asked
function askRobot(verb, args) {
    const sec = S.ui.sel;
    S.diag[sec] = { verb, waiting: true };
    render();
    send(verb, args).then((ack) => { S.diag[sec] = { verb, ack }; render(); });
}
const DIAG_ARGS = { "events.history": { limit: 20 } };
Object.assign(ACTIONS, {
    diag: { verb: (arg) => arg, run: (arg) => askRobot(arg, DIAG_ARGS[arg] || {}) },
    diagClear: { run: (arg) => { delete S.diag[arg]; render(); } },
    customSend: {
        run: () => {
            const raw = $("#c-custom-args").value.trim(), err = $('[data-slot="customErr"]');
            let args = {};
            if (raw) {
                try { args = JSON.parse(raw); if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error(); }
                catch { err.textContent = 'Arguments must be a JSON object, for example {"id": "right"}.'; err.hidden = false; return; }
            }
            err.hidden = true;
            askRobot($("#c-custom-verb").value, args);
        },
    },
});
