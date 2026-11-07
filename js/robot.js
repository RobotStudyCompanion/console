// RSC Console · The robot drawing and its animation loop.
"use strict";

// ---- The robot (front view) ----
const flipAngle = { l: 0, r: 0 };
// The ring's 16 LEDs sit under the hood round the button, seen slightly from above, so the circle is an ellipse.
// They are spaced evenly along it, not by angle: equal angles would bunch them up at the sides. The whole ring
// stays inside the blue band between the top of the head and the screen frame, as on the robot; the back half
// is drawn behind the button, the front half in front of it.
const RING_N = 16, RING_RX = 44, RING_RY = 5.5, RING_CY = 85;
const RING_PTS = (() => {
    const at = (th) => [180 + RING_RX * Math.cos(th), RING_CY + RING_RY * Math.sin(th)];
    const steps = 1440, len = [0];
    for (let k = 1; k <= steps; k++) {
        const [x0, y0] = at(2 * Math.PI * (k - 1) / steps), [x1, y1] = at(2 * Math.PI * k / steps);
        len.push(len[k - 1] + Math.hypot(x1 - x0, y1 - y0));
    }
    const pts = [];
    for (let i = 0, k = 0; i < RING_N; i++) {
        // Start at the front centre (θ = 90°) so the ring looks symmetric
        const target = (len[steps] * (i / RING_N + 0.25)) % len[steps];
        k = len.findIndex((l) => l >= target);
        const th = 2 * Math.PI * k / steps, [x, y] = at(th);
        pts.push({ x, y, rot: Math.atan2(RING_RY * Math.cos(th), -RING_RX * Math.sin(th)) * 180 / Math.PI });
    }
    return pts;
})();
const ringLeds = (cls, front) => RING_PTS.map((p, i) => (p.y >= RING_CY) === front
    ? `<rect class="${cls}" data-i="${i}" x="-3" y="-1.4" width="6" height="2.8" rx="0.7" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)})"/>` : "").join("");
let blinkUntil = 0;
function robotSVG() {
    let grille = "";
    [[252, 3], [261, 5], [270, 7]].forEach(([y, n]) => {
        for (let k = 0; k < n; k++) {
            const cx = 180 + (k - (n - 1) / 2) * 8;
            grille += `<circle class="rb-grille" cx="${cx}" cy="${y}" r="2"/><circle class="rb-grille-lit" data-p="${((cx - 156) / 48).toFixed(3)}" cx="${cx}" cy="${y}" r="2" opacity="0"/>`;
        }
    });
    const flipper = (id, x) => `<g id="${id}" transform="translate(${x} 150)"><rect class="rb-shell" x="-11" y="-36" width="22" height="104" rx="11"/><circle class="rb-pivot" r="3.5"/></g>`;
    return `<svg class="robot" viewBox="28 36 304 272" role="group" aria-label="The robot from the front. Select a part to control it.">
    <defs><filter id="rbBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
        <filter id="rbLedBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>
    <g class="part" data-part="movement" tabindex="0" role="button" aria-label="Flippers"><title>Flippers</title>
        <rect class="hl" x="38" y="98" width="44" height="136" rx="14"/><rect class="hl" x="278" y="98" width="44" height="136" rx="14"/>
        <rect class="rb-axle" x="62" y="146" width="18" height="8" rx="2"/><rect class="rb-axle" x="280" y="146" width="18" height="8" rx="2"/>
        ${flipper("rbFlipL", 62)}${flipper("rbFlipR", 298)}
    </g>
    <rect class="rb-shell" x="92" y="284" width="176" height="16" rx="8"/>
    <path class="rb-body" d="M150 226 C150 252 124 266 108 286 L252 286 C236 266 210 252 210 226 Z"/>
    <g class="part" data-part="sound" tabindex="0" role="button" aria-label="Speaker, in the base"><title>Speaker (in the base)</title>
        <rect class="hl" x="140" y="244" width="80" height="34" rx="10"/>${grille}
    </g>
    <rect class="rb-body" x="78" y="78" width="204" height="150" rx="26"/>
    <g class="part" data-part="light" tabindex="0" role="button" aria-label="Light ring, under the hood around the button on top"><title>Light ring (under the hood, around the button on top)</title>
        <ellipse class="hl" cx="180" cy="85" rx="51" ry="7"/><g filter="url(#rbLedBlur)">${ringLeds("rb-px-glow", false)}</g><g>${ringLeds("rb-px", false)}</g>
    </g>
    <g class="part" data-part="face" tabindex="0" role="button" aria-label="Screen"><title>Screen</title>
        <rect class="hl" x="88" y="88" width="184" height="132" rx="18"/>
        <rect class="rb-shell" x="94" y="92" width="172" height="122" rx="16"/>
        <rect class="rb-screen" x="102" y="100" width="156" height="106" rx="9"/>
        <g id="rbEyes"></g>
    </g>
    <g class="part" data-part="mic" tabindex="0" role="button" aria-label="Microphone, on the screen's frame"><title>Microphone (on the screen's frame)</title>
        <circle class="hl" cx="262" cy="116" r="6.5"/><circle class="rb-mic" cx="262" cy="116" r="2.2"/>
        <line class="rb-mic-off" id="rbMicOff" x1="258" y1="120" x2="266" y2="112"/>
    </g>
    <g class="part" data-part="led" tabindex="0" role="button" aria-label="Button on top"><title>Button (on top)</title>
        <rect class="hl" x="157" y="44" width="46" height="42" rx="10"/>
        <circle class="rb-led" id="rbBtnGlow" cx="180" cy="62" r="17" filter="url(#rbBlur)" opacity="0"/>
        <path class="rb-shell" d="M165 60 L165 80 A15 4.5 0 0 0 195 80 L195 60 Z"/>
        <ellipse class="rb-shell" cx="180" cy="60" rx="15" ry="4.5"/>
        <ellipse class="rb-led" id="rbBtnLit" cx="180" cy="60" rx="15" ry="4.5" opacity="0"/>
    </g>
    <g class="part" data-part="light" aria-hidden="true"><g filter="url(#rbLedBlur)">${ringLeds("rb-px-glow", true)}</g><g>${ringLeds("rb-px", true)}</g></g>
</svg>`;
}
// The flippers turn on an axle that comes out of the side, so from the front they only grow and shrink in height
function drawFlipper(g, deg) {
    const c = Math.cos(deg * Math.PI / 180);
    let top = Math.min(-36 * c, 68 * c), bot = Math.max(-36 * c, 68 * c);
    if (bot - top < 22) { const m = (top + bot) / 2; top = m - 11; bot = m + 11; }
    const r = g.querySelector("rect");
    r.setAttribute("y", top.toFixed(1));
    r.setAttribute("height", (bot - top).toFixed(1));
}
function drawRobot(t = performance.now()) {
    const svg = $("#consoleRoot svg.robot");
    if (!svg) return;
    // Each LED glows in the ring's colour; brightness shows as how strongly. Spin runs a bright spot with a tail round the ring.
    const mode = S.ring.mode, on = mode !== "off", col = `rgb(${S.ring.r} ${S.ring.g} ${S.ring.b})`;
    let level = on ? 0.3 + 0.7 * S.ring.level / 100 : 0;
    if (on && !reduced && mode === "pulse") level *= 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t / 1500 * 2 * Math.PI));
    const head = (t / 1500 % 1) * RING_N;
    svg.querySelectorAll(".rb-px-glow, .rb-px").forEach((el) => {
        const i = Number(el.dataset.i);
        let b = level;
        if (on && mode === "spin" && !reduced) b *= Math.max(0.12, 1 - ((head - i + RING_N) % RING_N) / 4);
        if (el.classList.contains("rb-px-glow")) {
            el.style.fill = col;
            el.setAttribute("opacity", (b * 0.95).toFixed(2));
        } else {
            el.style.fill = on ? `color-mix(in srgb, ${col} ${Math.round(45 + 30 * (1 - b))}%, white)` : "";
            el.style.stroke = on ? col : "";
            el.setAttribute("opacity", on ? Math.max(0.25, b).toFixed(2) : "1");
        }
    });
    drawFlipper(svg.querySelector("#rbFlipL"), reduced ? S.flip.left * 0.8 : flipAngle.l);
    drawFlipper(svg.querySelector("#rbFlipR"), reduced ? S.flip.right * 0.8 : flipAngle.r);
    // While the robot cycles its moods, it picks the next one and its timing itself and doesn't report them,
    // so the drawing says it's cycling rather than showing a face that would be out of step
    const mood = S.face.mood || "NEUTRAL";
    const blinking = t < blinkUntil, eyes = svg.querySelector("#rbEyes"), key = (S.face.cycle ? "cycle" : mood) + blinking;
    if (eyes.dataset.key !== key) {
        eyes.dataset.key = key;
        eyes.innerHTML = S.face.cycle
            ? `<g opacity="0.35">${eyesSVG("NEUTRAL", "rb", "rb-face", blinking)}</g><text class="rb-cycle" x="180" y="194" text-anchor="middle">Cycling moods</text>`
            : eyesSVG(mood, "rb", "rb-face", blinking);
    }
    // The same fades the robot runs: pulse a quick symmetric fade, breathe a slow one that rises faster than it falls
    const m = S.led.mode;
    let lit = m === "off" ? 0 : 1;
    if (!reduced && m === "pulse") lit = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t % LED_PERIOD.pulse) / LED_PERIOD.pulse);
    if (!reduced && m === "breathe") {
        const ph = (t % LED_PERIOD.breathe) / LED_PERIOD.breathe;
        lit = ph < 0.4 ? Math.sin(ph / 0.4 * Math.PI / 2) ** 2 : Math.cos((ph - 0.4) / 0.6 * Math.PI / 2) ** 2;
    }
    svg.querySelector("#rbBtnLit").setAttribute("opacity", lit.toFixed(2));
    svg.querySelector("#rbBtnGlow").setAttribute("opacity", (lit * 0.7).toFixed(2));
    // The speaker grille fills from left to right like a slider, with a soft edge
    const vol = S.sound.muted ? 0 : S.sound.volume / 100, soft = 0.3;
    svg.querySelectorAll(".rb-grille-lit").forEach((g) => {
        const v = vol <= 0 ? 0 : clamp((vol * (1 + soft) - Number(g.dataset.p)) / soft, 0, 1);
        g.setAttribute("opacity", v.toFixed(2));
    });
    svg.querySelector("#rbMicOff").style.display = S.mic.on ? "none" : "";
    svg.querySelectorAll(".part").forEach((g) => g.classList.toggle("is-sel", g.dataset.part === S.ui.sel));
}
let lastT = performance.now();
function robotLoop(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    if (S.view === "console") {
        if (!reduced) { flipAngle.l += S.flip.left / 100 * 240 * dt; flipAngle.r += S.flip.right / 100 * 240 * dt; }
        drawRobot(t);
    }
    requestAnimationFrame(robotLoop);
}
requestAnimationFrame(robotLoop);
document.addEventListener("keydown", (e) => {
    const part = e.target.closest?.(".part");
    if (part && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectPart(part.dataset.part); }
});
