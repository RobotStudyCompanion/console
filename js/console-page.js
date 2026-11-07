// RSC Console · The Console page: rendering, keeping controls in step, and input handling.
"use strict";

// ---- Under the robot: quick toggles, presets, reset ----
function quickHTML() {
    const muted = S.sound.muted, micOn = S.mic.on;
    return `<button type="button" class="qa" data-act="quickMute" aria-pressed="${muted}"><svg class="ic"><use href="#${muted ? "i-speaker-off" : "i-speaker"}"/></svg>${muted ? "Unmute speaker" : "Mute speaker"}</button>` +
        `<button type="button" class="qa" data-act="quickMic" aria-pressed="${!micOn}"><svg class="ic"><use href="#${micOn ? "i-mic" : "i-mic-off"}"/></svg>${micOn ? "Turn mic off" : "Turn mic on"}</button>`;
}
function updateQuick() {
    const key = `${S.sound.muted}|${S.mic.on}`;
    $$('[data-slot="quick"]').forEach((x) => { if (x.dataset.key !== key) { x.dataset.key = key; x.innerHTML = quickHTML(); } });
}
const toolsHTML = () => `<div class="stage-tools">
    <div class="tools-row">
        <span class="tools-quick" data-slot="quick" data-key="${S.sound.muted}|${S.mic.on}">${quickHTML()}</span>
        <div class="pop-wrap">
            <button type="button" class="btn sm" id="presetBtn" data-act="presets" aria-haspopup="menu" aria-expanded="false" aria-controls="presetPop">Presets<svg class="ic chev"><use href="#i-chev"/></svg></button>
            <div class="pop" id="presetPop" role="menu" aria-label="Presets" hidden></div>
        </div>
        ${btn("resetAll", '<svg class="ic"><use href="#i-reset"/></svg>Reset everything', "ghost sm danger-t push")}
    </div>
</div>`;

// ---- Rendering the console ----
const panel = () => {
    const s = secById(S.ui.sel);
    const reset = RESET[s.id] ? `<button type="button" class="btn ghost sm" data-act="reset:${s.id}" title="Reset ${s.name.toLowerCase()} to defaults"><svg class="ic"><use href="#i-reset"/></svg>Reset</button>` : "";
    return `<section class="card" aria-labelledby="ph-${s.id}"><header class="card-head"><h2 id="ph-${s.id}">${s.name}</h2>${reset}</header>${s.render()}</section>`;
};
const cur = (id) => (id === S.ui.sel ? ' aria-current="true"' : "");
function renderConsole() {
    const root = $("#consoleRoot");
    root.innerHTML = `<div class="robotwrap"><div class="robot-stage">${robotSVG()}
        <div class="part-chips" role="group" aria-label="Parts">${SECTIONS.map((s) => `<button type="button" data-act="sel:${s.id}"${cur(s.id)}>${s.name}</button>`).join("")}</div>
        ${toolsHTML()}</div>
        <div id="selPanel">${panel()}</div></div>`;
    hydrate(root);
}
function hydrate(root) {
    root.querySelectorAll("input[type=range]").forEach(paint);
    afterChange();
}
function refreshPanel() {
    const p = $("#selPanel");
    if (p) { p.innerHTML = panel(); hydrate(p); }
}
function select(id) {
    S.ui.sel = secById(id).id;
    saveUI();
    refreshPanel();
    $$('#consoleRoot [data-act^="sel:"]').forEach((b) => (b.dataset.act === "sel:" + S.ui.sel ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
    drawRobot();
}

function paint(el) {
    const min = +el.min, max = +el.max, p = (+el.value - min) / (max - min) * 100;
    if (el.classList.contains("bipolar")) {
        el.style.setProperty("--a", Math.min(p, 50) + "%");
        el.style.setProperty("--b", Math.max(p, 50) + "%");
    } else {
        el.style.setProperty("--a", "0%");
        el.style.setProperty("--b", p + "%");
    }
}
function syncControls(k, src) {
    const v = get(k);
    $$(`[data-k="${k}"]`).forEach((el) => {
        if (el !== src) {
            if (el.type === "checkbox") el.checked = !!v;
            else if (el.type === "radio") el.checked = String(el.value) === String(v);
            else el.value = v;
        }
        if (el.type === "range") paint(el);
    });
}
function dis(k, off) {
    $$(`[data-k="${k}"]`).forEach((el) => { el.disabled = off; });
    $$(`[data-field="${k}"]`).forEach((f) => f.classList.toggle("is-off", off));
}
const btnDis = (act, off) => $$(`[data-act="${act}"]`).forEach((b) => { b.disabled = off; });
function syncDisabled() {
    dis("sound.normalise", !S.sound.playback);
    dis("cal.us", !S.cal.holding);
    dis("cal.side", S.cal.holding);
    btnDis("calStart", S.cal.holding);
    btnDis("calSave", !S.cal.holding);
    btnDis("calRelease", !S.cal.holding);
    btnDis("runTest", S.sound.running);
}
// Controls whose command this robot's daemon doesn't have are disabled, not left to fail
function syncSupport() {
    const why = (verb) => `This robot's rsc-host doesn't have ${verb}`;
    for (const [k, verb] of Object.entries(NEEDS_KEY)) {
        const mixerGone = k.startsWith("mic.") && S.mic.missing.has(k.slice(4));
        if (supports(verb) && !mixerGone) continue;
        dis(k, true);
        $$(`[data-field="${k}"]`).forEach((f) => { f.title = mixerGone ? "This robot's sound card has no such mixer control" : why(verb); });
    }
    $$("[data-act]").forEach((b) => {
        const a = b.dataset.act, i = a.indexOf(":"), cmd = i < 0 ? a : a.slice(0, i);
        const verb = cmd === "diag" ? a.slice(i + 1) : NEEDS_ACT[cmd];
        if (verb && !supports(verb)) { b.disabled = true; b.title = why(verb); }
    });
}
function afterChange() {
    syncDisabled();
    syncSupport();
    $$("[data-mood]").forEach((b) => b.setAttribute("aria-pressed", String(!S.face.cycle && b.dataset.mood === S.face.mood)));
    updateQuick();
    drawRobot();
}

// Sends at most 10 times a second while dragging, and always sends the value you let go on
const thr = {};
function throttled(key, fn) {
    const t = thr[key] || (thr[key] = { last: 0, timer: null });
    clearTimeout(t.timer);
    const wait = 100 - (performance.now() - t.last);
    if (wait <= 0) { t.last = performance.now(); fn(); }
    else t.timer = setTimeout(() => { t.last = performance.now(); fn(); }, wait);
}

document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.name === "theme") { S.ui.theme = el.value; saveUI(); applyTheme(); return; }
    if (el.id === "setPrompt") { S.prefs.systemPrompt = el.value; savePrefs(); return; }
    if (el.id === "setOnboarding") { S.prefs.onboarding = el.checked; savePrefs(); return; }
    const k = el.dataset?.k;
    if (!k || el.type === "number") return;
    if (el.type === "color") {
        const n = parseInt(el.value.slice(1), 16);
        Object.assign(S.ring, { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 });
        ringColourChanged();
        afterChange();
        return;
    }
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "radio") { if (!el.checked) return; v = typeof get(k) === "number" ? Number(el.value) : el.value; }
    else if (el.type === "range") {
        v = Number(el.value);
        if ((k === "flip.left" || k === "flip.right") && Math.abs(v) <= 4) { v = 0; el.value = "0"; }
    } else return;
    touched[k] = performance.now();
    set(k, v);
    syncControls(k, el);
    if (k === "cal.side") updateSlots();
    afterChange();
    const fn = SEND[k];
    if (!fn) return;
    if (el.type === "range") throttled(k, fn);
    else fn();
    if (AUTOSAVE.has(k)) autosave();
});
document.addEventListener("change", (e) => {
    const el = e.target, k = el.dataset?.k;
    if (!k || el.type !== "number") return;
    const min = +el.min, max = +el.max, step = +el.step || 1;
    let v = Number(el.value);
    if (el.value.trim() === "" || !Number.isFinite(v)) v = get(k);
    v = +clamp(Math.round(v / step) * step, min, max).toFixed(2);
    touched[k] = performance.now();
    set(k, v);
    syncControls(k, null);
    afterChange();
    SEND[k]?.();
    if (AUTOSAVE.has(k)) autosave();
});
document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches?.("details[data-adv]")) { S.ui.adv[d.dataset.adv] = d.open; saveUI(); }
}, true);
