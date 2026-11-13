// RSC Console · Runs data-act buttons (each file adds its own to ACTIONS), plus the click and Escape handlers.
"use strict";

// ---- Actions ----
function act(a, el) {
    const [name, arg] = parseAct(a);
    ACTIONS[name]?.run(arg, el);
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".pop-wrap")) setPresetMenu(false);
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled) { act(b.dataset.act, b); return; }
    const part = e.target.closest(".part");
    if (part) { selectPart(part.dataset.part); return; }
    const le = e.target.closest(".le-btn");
    if (le) {
        const pre = le.nextElementSibling;
        if (pre) { pre.hidden = !pre.hidden; le.setAttribute("aria-expanded", String(!pre.hidden)); }
        return;
    }
    if (e.target.classList.contains("modal-bg")) e.target.hidden = true;
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (chatVoice) { endVoice(true); return; }
    if ($("#presetPop") && !$("#presetPop").hidden) { setPresetMenu(false); $("#presetBtn").focus(); return; }
    if (!$("#menu").hidden) { closeMenu(); $("#burger").focus(); return; }
    if (logExpanded) { logExpanded = false; applyDock(); return; }
    $$(".modal-bg").forEach((m) => { m.hidden = true; });
});
phone.addEventListener("change", applyDock);
