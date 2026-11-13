// RSC Console · Page routing, the menu, theme, modals, Stop all and the power dialog, and their buttons.
"use strict";

// ---- Routing ----
const TITLES = { console: "Console", chat: "Chat", settings: "Settings" };
function go(view) {
    if (!["connect", "console", "chat", "settings"].includes(view)) view = "connect";
    if (view !== "connect" && !C.connected) view = "connect";
    if (view !== "chat") endVoice(true);
    S.view = view;
    document.body.dataset.view = view;
    $("#viewConnect").hidden = view !== "connect";
    $("#shell").hidden = view === "connect";
    $("#pageConsole").hidden = view !== "console";
    $("#pageChat").hidden = view !== "chat";
    $("#pageSettings").hidden = view !== "settings";
    $("#tbTitle").textContent = TITLES[view] || "Console";
    $("#stopAll").hidden = view !== "console";
    $("#logToggle").hidden = view === "settings";
    $$("[data-nav]").forEach((b) => (b.dataset.nav === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    closeMenu();
    if (view === "console") renderConsole();
    if (view === "chat") renderChat();
    applyDock();
}

// ---- Menu (side sheet below the top bar) ----
function placeMenu() { document.body.style.setProperty("--menu-top", Math.round($(".topbar").getBoundingClientRect().bottom) + "px"); }
function openMenu() {
    placeMenu();
    renderChatLists();
    $("#menu").hidden = false;
    $("#menuBackdrop").hidden = false;
    const b = $("#burger");
    b.setAttribute("aria-expanded", "true");
    b.setAttribute("aria-label", "Close menu");
    b.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>';
}
function closeMenu() {
    if ($("#menu").hidden) return;
    $("#menu").hidden = true;
    $("#menuBackdrop").hidden = true;
    const b = $("#burger");
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-label", "Open menu");
    b.innerHTML = '<svg class="ic"><use href="#i-menu"/></svg>';
}
addEventListener("resize", () => { if (!$("#menu").hidden) placeMenu(); });

// ---- Theme (Settings page; its radios follow S.ui.theme through render()) ----
function applyTheme() {
    const r = document.documentElement;
    if (S.ui.theme === "auto") r.removeAttribute("data-theme");
    else r.setAttribute("data-theme", S.ui.theme);
}

function openModal(id, focusSel) {
    closeMenu();
    setPresetMenu(false);
    $(id).hidden = false;
    $(focusSel)?.focus();
}

// Stop all: spinner until the robot confirms the stop
function stopping(el, stopped) {
    const t0 = performance.now(), token = (el._stopToken || 0) + 1;
    el._stopToken = token;
    el.innerHTML = '<i class="spin" aria-hidden="true"></i><span>Stopping</span>';
    el.setAttribute("aria-busy", "true");
    stopped.then(() => setTimeout(() => {
        if (el._stopToken !== token) return;
        el.innerHTML = '<svg class="ic"><use href="#i-stop"/></svg><span>Stop all</span>';
        el.removeAttribute("aria-busy");
    }, Math.max(0, 600 - (performance.now() - t0))));
}

function openPower() {
    const r = S.robot, allowed = !r.simulated && r.powerAllowed;
    $("#powerBody").textContent = allowed
        ? `Restart or shut down ${r.host}? Restart brings it back by itself in about a minute. After a shutdown, someone has to reach the power supply, and the screen goes blank. Either way the flippers stop and the light ring goes dark first.`
        : r.simulated
            ? "This robot is simulated by rsc-host's fake backend, so there is nothing to restart or shut down."
            : `This robot doesn't let the console restart or shut it down${r.powerReason ? `: ${r.powerReason}` : ""}.${r.powerFix ? ` To fix it: ${r.powerFix}.` : ""}`;
    $("#powerReboot").disabled = !allowed;
    $("#powerOff").disabled = !allowed;
    openModal("#powerBg", '[data-act="closePower"]');
}
function powerAction(action) {
    $("#powerBg").hidden = true;
    C.expectClose = powerNote(action);
    send("system." + action, { confirm: true }).then((ack) => {
        if (!ack?.ok || ack.result?.scheduled === false) {
            C.expectClose = "";
            log("err", `the robot didn't ${action === "reboot" ? "restart" : "shut down"}${ack?.result?.reason ? `: ${ack.result.reason}` : ""}`);
            revealLog();
        }
    });
}

Object.assign(ACTIONS, {
    menu: { run: () => ($("#menu").hidden ? openMenu() : closeMenu()) },
    closeMenu: { run: closeMenu },
    nav: { run: (arg) => go(arg) },
    power: { run: (arg) => (arg ? powerAction(arg) : openPower()) },
    closePower: { run: () => { $("#powerBg").hidden = true; } },
    disconnect: { run: () => { closeMenu(); disconnect(); } },
    resetAll: { run: () => openModal("#resetBg", '[data-act="closeReset"]') },
    closeReset: { run: () => { $("#resetBg").hidden = true; } },
});
