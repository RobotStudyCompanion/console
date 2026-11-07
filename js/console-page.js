// RSC Console · The Console page: rendering, the one way controls change (userSet/robotSet), render(), its buttons.
"use strict";

// ---- Under the robot: quick toggles, presets, reset ----
function quickHTML() {
    const muted = S.sound.muted, micOn = S.mic.on;
    return `<button type="button" class="qa" data-act="quickMute" aria-pressed="${muted}"><svg class="ic"><use href="#${muted ? "i-speaker-off" : "i-speaker"}"/></svg>${muted ? "Unmute speaker" : "Mute speaker"}</button>` +
        `<button type="button" class="qa" data-act="quickMic" aria-pressed="${!micOn}"><svg class="ic"><use href="#${micOn ? "i-mic" : "i-mic-off"}"/></svg>${micOn ? "Turn mic off" : "Turn mic on"}</button>`;
}
const toolsHTML = () => `<div class="stage-tools">
    <div class="tools-row">
        <span class="tools-quick" data-slot="quick">${quickHTML()}</span>
        <div class="pop-wrap">
            <button type="button" class="btn sm" id="presetBtn" data-act="presets" aria-haspopup="menu" aria-expanded="false" aria-controls="presetPop">Presets<svg class="ic chev"><use href="#i-chev"/></svg></button>
            <div class="pop" id="presetPop" role="menu" aria-label="Presets" hidden></div>
        </div>
        ${btn("resetAll", '<svg class="ic"><use href="#i-reset"/></svg>Reset everything', "ghost sm danger-t push")}
    </div>
</div>`;

// ---- Rendering the console ----
const panelHTML = () => {
    const s = secById(S.ui.sel);
    const reset = RESET[s.id] ? `<button type="button" class="btn ghost sm" data-act="reset:${s.id}" title="Reset ${s.name.toLowerCase()} to defaults"><svg class="ic"><use href="#i-reset"/></svg>Reset</button>` : "";
    return `<section class="card" aria-labelledby="ph-${s.id}"><header class="card-head"><h2 id="ph-${s.id}">${s.name}</h2>${reset}</header>${s.render()}</section>`;
};
function renderConsole() {
    $("#consoleRoot").innerHTML = `<div class="robotwrap"><div class="robot-stage">${robotSVG()}
        <div class="part-chips" role="group" aria-label="Parts">${SECTIONS.map((s) => `<button type="button" data-act="sel:${s.id}"${s.id === S.ui.sel ? ' aria-current="true"' : ""}>${s.name}</button>`).join("")}</div>
        ${toolsHTML()}</div>
        <div id="selPanel">${panelHTML()}</div></div>`;
    render();
}
// Rebuilds the selected part's panel, for when what it shows changes, not just its values
function refreshPanel() {
    const p = $("#selPanel");
    if (p) p.innerHTML = panelHTML();
    render();
}
function selectPart(id) {
    S.ui.sel = secById(id).id;
    saveUI();
    refreshPanel();
    $$('#consoleRoot [data-act^="sel:"]').forEach((b) => (b.dataset.act === "sel:" + S.ui.sel ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
}

function paintRange(el) {
    const min = +el.min, max = +el.max, p = (+el.value - min) / (max - min) * 100;
    if (el.classList.contains("bipolar")) {
        el.style.setProperty("--a", Math.min(p, 50) + "%");
        el.style.setProperty("--b", Math.max(p, 50) + "%");
    } else {
        el.style.setProperty("--a", "0%");
        el.style.setProperty("--b", p + "%");
    }
}

// ---- render(): the page from S ----
// Parts of the page rebuilt from S, by their data-slot
const SLOTS = { testResult, calStored, diag: (el) => diagHTML(el.dataset.sec), quick: quickHTML };
// Why a control or button can't be used now: null when it can, otherwise its tooltip ("" for none).
// A verb this robot's daemon doesn't have disables it instead of letting it fail.
function whyOff(verb, off) {
    if (verb && !supports(verb)) return `This robot's rsc-host doesn't have ${verb}`;
    const r = off?.();
    return r ? (typeof r === "string" ? r : "") : null;
}
// A reason replaces the element's own tooltip while it lasts
function setTip(el, why) {
    el._tip ??= el.title;
    el.title = why || el._tip;
}
// Writes every control, slot and disabled state from S. Safe to call after any change.
function render() {
    for (const el of $$("[data-k]")) {
        const ctl = CONTROLS[el.dataset.k] || {}, v = ctl.get ? ctl.get() : getPath(el.dataset.k);
        if (el.type === "checkbox") el.checked = !!v;
        else if (el.type === "radio") el.checked = String(el.value) === String(v);
        // Don't overwrite a number or text you are typing
        else if (!(el === document.activeElement && (el.type === "number" || el.tagName === "TEXTAREA")) && el.value !== String(v)) el.value = v;
        if (el.type === "range") paintRange(el);
        el.disabled = whyOff(ctl.verb, ctl.off) != null;
    }
    for (const f of $$("[data-field]")) {
        const ctl = CONTROLS[f.dataset.field] || {}, why = whyOff(ctl.verb, ctl.off);
        f.classList.toggle("is-off", why != null);
        setTip(f, why);
    }
    for (const el of $$("[data-slot]")) {
        const fn = SLOTS[el.dataset.slot];
        if (!fn) continue;
        const html = fn(el);
        if (el._html !== html) { el._html = html; el.innerHTML = html; }
    }
    for (const b of $$("[data-act]")) {
        const [name, arg] = parseAct(b.dataset.act), rule = ACTIONS[name];
        if (!rule || !(rule.verb || rule.off)) continue;
        const why = whyOff(typeof rule.verb === "function" ? rule.verb(arg) : rule.verb, rule.off);
        b.disabled = why != null;
        setTip(b, why);
    }
    $$("[data-mood]").forEach((b) => b.setAttribute("aria-pressed", String(!S.face.cycle && b.dataset.mood === S.face.mood)));
}

// ---- Changing a control ----
// Sends at most 10 times a second while dragging, and always sends the value you let go on
const throttles = {};
function throttled(key, fn) {
    const t = throttles[key] || (throttles[key] = { last: 0, timer: null });
    clearTimeout(t.timer);
    const wait = 100 - (performance.now() - t.last);
    if (wait <= 0) { t.last = performance.now(); fn(); }
    else t.timer = setTimeout(() => { t.last = performance.now(); fn(); }, wait);
}
// You changed control k to v: apply it (CONTROLS) and show it
function userSet(k, v) {
    const ctl = CONTROLS[k] || {}, group = ctl.group || k;
    touched[group] = performance.now();
    if (ctl.set) ctl.set(v); else setPath(k, v);
    throttled(group, () => { ctl.apply?.(); if (ctl.keep) autosave(); render(); });
    render();
}
// The robot reported v for control k: show it, without sending anything back
function robotSet(k, v) {
    setPath(k, v);
    render();
}

document.addEventListener("input", (e) => {
    const el = e.target, k = el.dataset?.k;
    if (!k || el.type === "number") return;
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "radio") { if (!el.checked) return; v = typeof getPath(k) === "number" ? Number(el.value) : el.value; }
    else if (el.type === "range") {
        v = Number(el.value);
        const snap = CONTROLS[k]?.snap;
        if (snap && Math.abs(v) <= snap) v = 0;
    } else v = el.value;
    userSet(k, v);
});
// Number boxes apply when you press Enter or leave them, rounded to the step and kept in range
document.addEventListener("change", (e) => {
    const el = e.target, k = el.dataset?.k;
    if (!k || el.type !== "number") return;
    const step = +el.step || 1;
    let v = Number(el.value);
    if (el.value.trim() === "" || !Number.isFinite(v)) v = getPath(k);
    v = +clamp(Math.round(v / step) * step, +el.min, +el.max).toFixed(2);
    el.value = v;
    userSet(k, v);
});
document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches?.("details[data-adv]")) { S.ui.adv[d.dataset.adv] = d.open; saveUI(); }
}, true);

// ---- The console's buttons ----
Object.assign(ACTIONS, {
    sel: { run: (arg) => selectPart(arg) },
    flip: { run: (arg) => { const [id, dir] = arg.split(":"); userSet("flip." + id, Number(dir) * SPEEDS[S.ui.speed]); } },
    stopAll: { verb: "flipper.stop_all", run: (arg, el) => { stopping(el, stopMotion()); render(); } },
    ringColour: { verb: "ring.mode", run: (arg) => userSet("ring.hex", rgbHex(...arg.split(",").map(Number))) },
    mood: { verb: "cyd.mood", run: (arg) => { setMood(arg); render(); } },
    // The drawing blinks too; the animation loop draws it
    blink: { verb: "cyd.blink", run: () => { send("cyd.blink"); blinkUntil = performance.now() + 220; } },
    quickMute: { verb: "audio.mute", run: () => userSet("sound.muted", !S.sound.muted) },
    quickMic: { verb: "audio.mic_mute", run: () => userSet("mic.on", !S.mic.on) },
    runTest: {
        verb: "audio.selftest",
        off: () => S.sound.running,
        run: () => {
            S.sound.running = true;
            S.sound.error = "";
            render();
            send("audio.selftest", { seconds: 3, playback: S.sound.playback, normalise: S.sound.normalise }).then((ack) => {
                S.sound.running = false;
                if (ack?.ok && ack.result && typeof ack.result.rms_dbfs === "number") {
                    S.sound.result = { peak: ack.result.peak_dbfs, rms: ack.result.rms_dbfs, clipped: ack.result.clipped_samples || 0 };
                } else {
                    S.sound.error = ack ? `The test failed: ${ack.code || "no levels in the reply"}${ack.message ? `, ${ack.message}` : ""}` : "The test didn't finish: the connection closed.";
                }
                render();
            });
        },
    },
    stopPlay: { verb: "audio.stop_play", run: () => send("audio.stop_play") },
    mixerReset: { verb: "audio.mixer.reset", run: () => { resetMixer(); autosave(); } },
    calStart: {
        verb: "servo.hold",
        off: () => S.cal.holding,
        run: () => {
            S.cal.holding = true;
            send("servo.hold", { id: S.cal.side }).then((ack) => {
                if (ack?.ok && typeof ack.result?.holding_us === "number") S.cal.us = ack.result.holding_us;
                else S.cal.holding = false;
                render();
            });
            render();
        },
    },
    calSave: {
        verb: "servo.calibrate",
        off: () => !S.cal.holding,
        run: (arg, el) => send("servo.calibrate", { id: S.cal.side, null_us: S.cal.us, persist: true }).then((ack) => {
            const n = ack?.ok ? ack.result?.calibration?.null_us : null;
            if (typeof n === "number") { S.cal.stored[S.cal.side] = n; render(); flash(el, "Saved"); }
        }),
    },
    calRelease: { verb: "servo.hold.stop", off: () => !S.cal.holding, run: () => { S.cal.holding = false; send("servo.hold.stop", { id: S.cal.side }); render(); } },
    calReset: {
        verb: "servo.calibration.reset",
        run: () => send("servo.calibration.reset").then(() => send("servo.calibration")).then((ack) => {
            const c = ack?.ok ? ack.result?.calibration : null;
            if (c) for (const id of ["left", "right"]) if (typeof c[id]?.null_us === "number") S.cal.stored[id] = c[id].null_us;
            render();
        }),
    },
    reset: { run: (arg) => { RESET[arg]?.(); render(); } },
    resetAllGo: { run: () => { resetAll(); $("#resetBg").hidden = true; render(); } },
});
