// RSC Console · HTML builders for sliders, segmented choices, switches, buttons, and the mood glyphs.
"use strict";

// ---- Control builders ----
const idOf = (k) => "c-" + k.replace(/\./g, "-");
function slider(k, label, o) {
    const id = idOf(k), v = getPath(k), u = o.unit ? " " + o.unit : "";
    const lab = o.labels || [minus(o.min) + u, minus(o.max) + u];
    return `<div class="field" data-field="${k}">
<div class="field-head"><label for="${id}">${label}</label><span class="num"><input type="number" id="${id}-n" data-k="${k}" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}" aria-label="${label}, exact value">${o.unit ? `<span class="unit">${o.unit}</span>` : ""}</span></div>
<input type="range" id="${id}" class="range${o.bipolar ? " bipolar" : ""}" data-k="${k}" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}">
<div class="ticks">${lab.map((t) => `<span>${t}</span>`).join("")}</div></div>`;
}
function seg(k, label, opts) {
    const id = idOf(k), v = String(getPath(k));
    return `<div class="field" data-field="${k}"><span class="field-label" id="${id}-l">${label}</span><div class="seg" role="radiogroup" aria-labelledby="${id}-l">${opts.map(([val, t]) =>
        `<label class="seg-opt"><input type="radio" name="${id}" id="${id}-${val}" data-k="${k}" value="${val}"${String(val) === v ? " checked" : ""}><span>${t}</span></label>`).join("")}</div></div>`;
}
function toggle(k, label) {
    const id = idOf(k);
    return `<label class="switch-row" data-field="${k}" for="${id}"><span>${label}</span><input type="checkbox" role="switch" id="${id}" data-k="${k}"${getPath(k) ? " checked" : ""}><span class="switch" aria-hidden="true"></span></label>`;
}
const btn = (act, label, cls = "") => `<button type="button" class="btn ${cls}" data-act="${act}">${label}</button>`;
const hint = (t) => `<p class="hint">${t}</p>`;
const box = (...parts) => `<div class="box">${parts.join("")}</div>`;
const check = (act, name, desc, label = "Run") => `<div class="check"><div><strong>${name}</strong><span>${desc}</span></div>${btn(act, label, "sm")}</div>`;
const checks = (...rows) => `<div class="checks">${rows.join("")}</div>`;
const adv = (id, body) => `<details class="adv" data-adv="${id}"${S.ui.adv[id] ? " open" : ""}><summary><svg class="ic"><use href="#i-chev"/></svg>Advanced</summary><div class="adv-body">${body}</div></details>`;

const GLYPH = {
    blink: '<svg class="glyph" viewBox="0 0 30 30" aria-hidden="true"><rect x="3" y="5" width="24" height="20" rx="4"/><path d="M9 13h4M17 13h4M11 19h8"/></svg>',
};
// Both eyes the way the screen's firmware draws them, centred on the robot drawing's screen. Each eye is clipped
// to the part between its lids with one shape (a mask of several lid shapes left hairline seams). `id` keeps each
// clip's name unique on the page.
function eyesSVG(mood, id, cls, closed) {
    const e = EYES[mood] || EYES.NEUTRAL, cy = 152, R = 22, n = (v) => +v.toFixed(2);
    return [["l", 153, true], ["r", 207, false]].map(([side, cx, isLeft]) => {
        const [topH, botH, tilt, pupil, radius] = Array.isArray(e) ? e : e[side];
        const k = R / 45, r = radius * k, p = pupil * k, tl = Math.abs(tilt) * k;
        // Below the top lid and above the bottom lid. A tilted top lid runs from one corner down to the other side:
        // its low point is towards the nose when tilt > 0 (angry), towards the outside when < 0 (sad).
        const y0 = cy - r + (closed ? 100 : topH) * k, y1 = cy + r + 5 * k - botH * k;
        if (y0 >= y1) return "";
        const low = (tilt < 0) === isLeft ? -1 : 1, lowX = cx + low * r, highX = cx - low * r, out = r + 3;
        const clip = `eye-${id}-${side}`;
        return `<clipPath id="${clip}"><polygon points="${n(cx - low * out)},${n(y0)} ${n(highX)},${n(y0)} ${n(lowX)},${n(y0 + tl)} ${n(cx + low * out)},${n(y0 + tl)} ${n(cx + low * out)},${n(y1)} ${n(cx - low * out)},${n(y1)}"/></clipPath>` +
            `<path class="${cls}" fill-rule="evenodd" clip-path="url(#${clip})" d="M${n(cx - r)} ${cy}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z` +
            `M${n(cx - p)} ${cy}a${n(p)} ${n(p)} 0 1 0 ${n(2 * p)} 0a${n(p)} ${n(p)} 0 1 0 ${n(-2 * p)} 0Z"/>`;
    }).join("");
}
// A mood button shows the same eyes as the robot drawing, framed like the screen
const faceGlyph = (m) => `<svg class="glyph" viewBox="124 122 112 60" aria-hidden="true"><rect x="126" y="124" width="108" height="56" rx="10" vector-effect="non-scaling-stroke"/>${eyesSVG(m, "g" + m, "f", false)}</svg>`;
