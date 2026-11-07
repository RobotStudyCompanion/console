// RSC Console · Every data-act button, plus the click and Escape handlers.
"use strict";

// ---- Actions ----
function act(a, el) {
    const i = a.indexOf(":"), cmd = i < 0 ? a : a.slice(0, i), arg = i < 0 ? "" : a.slice(i + 1);
    switch (cmd) {
        case "connect": {
            const r = recentRobots().find((x) => x.host === arg);
            if (!r) break;
            const token = store.raw(K.token(r.host));
            if (token) { connectTo(r.host, r.port || 8765, token, el); break; }
            $("#cfHost").value = r.host;
            $("#cfPort").value = String(r.port || 8765);
            formError(`Enter the token for ${r.host}.`);
            $("#cfToken").focus();
            break;
        }
        case "forget": forgetRobot(arg); renderRecent(); break;
        case "scan": scan(el); break;
        case "useScan": $("#cfHost").value = arg; $("#cfHost").dispatchEvent(new Event("input")); $("#cfToken").focus(); break;
        case "menu": $("#menu").hidden ? openMenu() : closeMenu(); break;
        case "closeMenu": closeMenu(); break;
        case "nav": go(arg); break;
        case "toggleLog": setDock(S.dock.state === "closed" ? "open" : "closed"); break;
        case "logClose": setDock("closed"); break;
        case "logExpand": logExpanded = !logExpanded; applyDock(); break;
        case "logBody": if (phone.matches && !logExpanded) { logBodyOpen = !logBodyOpen; applyDock(); } break;
        case "filter": S.dock.filter = arg; applyDock(); applyFilter(); break;
        case "copyLog": copyText(logText()).then((ok) => { if (ok) flash(el, ""); }); break;
        case "saveLog": {
            const text = logText();
            if (!text) break;
            const link = document.createElement("a");
            link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            link.download = `rsc-console-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.log`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            break;
        }
        case "clearLog": LOG.length = 0; $("#logList").innerHTML = ""; unread = 0; renderLogHead(); break;
        case "stopAll":
            S.flip.left = 0; S.flip.right = 0;
            ["flip.left", "flip.right"].forEach((k) => syncControls(k, null));
            if (S.cal.holding) { S.cal.holding = false; send("servo.hold.stop", {}, { urgent: true }); updateSlots(); }
            stopping(el);
            afterChange();
            break;
        case "flip": {
            const [id, dir] = arg.split(":");
            S.flip[id] = Number(dir) * SPEEDS[S.ui.speed];
            syncControls("flip." + id, null);
            sendFlip(id);
            afterChange();
            break;
        }
        case "ringColour": {
            const [r, g, b] = arg.split(",").map(Number);
            Object.assign(S.ring, { r, g, b });
            ringColourChanged();
            afterChange();
            break;
        }
        case "mood": setMood(arg); updateSlots(); afterChange(); break;
        case "blink": send("cyd.blink"); blinkUntil = performance.now() + 220; drawRobot(); setTimeout(() => drawRobot(), 240); break;
        case "runTest":
            S.sound.running = true;
            S.sound.error = "";
            updateSlots();
            syncDisabled();
            send("audio.selftest", { seconds: 3, playback: S.sound.playback, normalise: S.sound.normalise }).then((ack) => {
                S.sound.running = false;
                if (ack?.ok && ack.result && typeof ack.result.rms_dbfs === "number") {
                    S.sound.result = { peak: ack.result.peak_dbfs, rms: ack.result.rms_dbfs, clipped: ack.result.clipped_samples || 0 };
                } else {
                    S.sound.error = ack ? `The test failed: ${ack.code || "no levels in the reply"}${ack.message ? `, ${ack.message}` : ""}` : "The test didn't finish: the connection closed.";
                }
                updateSlots();
                syncDisabled();
            });
            break;
        case "stopPlay": send("audio.stop_play"); break;
        case "mixerReset":
            send("audio.mixer.reset").then(() => readMixer()).then(() => { ["mic.boostL", "mic.boostR", "mic.capture"].forEach((k) => syncControls(k, null)); afterChange(); autosave(); });
            break;
        case "calStart":
            S.cal.holding = true;
            send("servo.hold", { id: S.cal.side }).then((ack) => {
                if (ack?.ok && typeof ack.result?.holding_us === "number") { S.cal.us = ack.result.holding_us; syncControls("cal.us", null); }
                else S.cal.holding = false;
                updateSlots();
                afterChange();
            });
            updateSlots();
            afterChange();
            break;
        case "calSave":
            send("servo.calibrate", { id: S.cal.side, null_us: S.cal.us, persist: true }).then((ack) => {
                const n = ack?.ok ? ack.result?.calibration?.null_us : null;
                if (typeof n === "number") { S.cal.stored[S.cal.side] = n; updateSlots(); flash(el, "Saved"); }
            });
            break;
        case "calRelease": S.cal.holding = false; send("servo.hold.stop", { id: S.cal.side }); updateSlots(); afterChange(); break;
        case "calReset":
            send("servo.calibration.reset").then(() => send("servo.calibration")).then((ack) => {
                const c = ack?.ok ? ack.result?.calibration : null;
                if (c) for (const id of ["left", "right"]) if (typeof c[id]?.null_us === "number") S.cal.stored[id] = c[id].null_us;
                updateSlots();
            });
            break;
        case "diag": askRobot(arg, arg === "events.history" ? { limit: 20 } : {}); break;
        case "diagClear": delete S.diag[arg]; updateSlots(); break;
        case "customSend": {
            const raw = $("#c-custom-args").value.trim(), err = $('[data-slot="customErr"]');
            let args = {};
            if (raw) {
                try { args = JSON.parse(raw); if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error(); }
                catch { err.textContent = 'Arguments must be a JSON object, for example {"id": "right"}.'; err.hidden = false; return; }
            }
            err.hidden = true;
            askRobot($("#c-custom-verb").value, args);
            break;
        }
        case "reset": RESET[arg]?.(); refreshPanel(); afterChange(); break;
        case "resetAll": openModal("#resetBg", '[data-act="closeReset"]'); break;
        case "resetAllGo":
            Object.values(RESET).forEach((f) => f());
            $("#resetBg").hidden = true;
            refreshPanel();
            afterChange();
            break;
        case "closeReset": $("#resetBg").hidden = true; break;
        case "quickMute": S.sound.muted = !S.sound.muted; send("audio.mute", { muted: S.sound.muted }); syncControls("sound.muted", null); afterChange(); break;
        case "quickMic": S.mic.on = !S.mic.on; send("audio.mic_mute", { muted: !S.mic.on }); syncControls("mic.on", null); afterChange(); break;
        case "presets": setPresetMenu($("#presetPop").hidden); break;
        case "applyPreset": {
            const p = arg === "default" ? { name: "Default", snap: clone(DEFAULTS) } : PRESETS[Number(arg)];
            setPresetMenu(false);
            if (!p) break;
            applySnap(p.snap);
            refreshPanel();
            afterChange();
            flash($("#presetBtn"), p.name);
            break;
        }
        case "savePreset":
            $("#presetName").value = "";
            $("#presetErr").hidden = true;
            openModal("#presetBg", "#presetName");
            break;
        case "closePreset": $("#presetBg").hidden = true; break;
        case "power":
            if (!arg) { openPower(); break; }
            $("#powerBg").hidden = true;
            C.expectClose = arg === "reboot" ? `${S.robot.host} is restarting. It should be back in about a minute.` : `${S.robot.host} is shutting down. Someone has to reach its power supply to start it again.`;
            send("system." + arg, { confirm: true }).then((ack) => {
                if (!ack?.ok || ack.result?.scheduled === false) {
                    C.expectClose = "";
                    log("err", `the robot didn't ${arg === "reboot" ? "restart" : "shut down"}${ack?.result?.reason ? `: ${ack.result.reason}` : ""}`);
                    revealLog();
                } else if (arg === "poweroff") blankScreen();
            });
            break;
        case "closePower": $("#powerBg").hidden = true; break;
        case "disconnect": closeMenu(); disconnect(); break;
        case "sel": select(arg); break;
        case "openChat": stopStream(); endVoice(true); chatId = arg; closeMenu(); renderChat(); break;
        case "newChat": {
            stopStream();
            endVoice(true);
            // Reuse an empty chat instead of piling up blank ones
            const blank = CHATS.find((c) => c.msgs.every((m) => m.role === "intro"));
            const c = blank || newChatObj();
            if (!blank) CHATS.unshift(c);
            c.at = Date.now();
            chatId = c.id;
            saveChats();
            closeMenu();
            renderChat();
            $("#chatInput").focus();
            break;
        }
        case "attach": $("#fileInput").click(); break;
        case "unattach": pending.splice(Number(arg), 1); renderFiles(); break;
        case "voice": voice ? endVoice(false) : startVoice(); break;
    }
}

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

document.addEventListener("click", (e) => {
    if (!e.target.closest(".pop-wrap")) setPresetMenu(false);
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled) { act(b.dataset.act, b); return; }
    const part = e.target.closest(".part");
    if (part) { select(part.dataset.part); return; }
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
    if (voice) { endVoice(true); return; }
    if ($("#presetPop") && !$("#presetPop").hidden) { setPresetMenu(false); $("#presetBtn").focus(); return; }
    if (!$("#menu").hidden) { closeMenu(); $("#burger").focus(); return; }
    if (logExpanded) { logExpanded = false; applyDock(); return; }
    $$(".modal-bg").forEach((m) => { m.hidden = true; });
});
phone.addEventListener("change", applyDock);
