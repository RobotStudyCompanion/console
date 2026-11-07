// RSC Console · Small helpers: DOM lookups, safe localStorage, escaping, media queries, button flash, the action table.
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    raw(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    setRaw(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const minus = (n) => (n < 0 ? "−" + Math.abs(n) : String(n));
const clone = (o) => JSON.parse(JSON.stringify(o));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = matchMedia("(max-width: 760px)");
const wide = matchMedia("(min-width: 1100px)");

// Every button with data-act="name" or data-act="name:arg" runs ACTIONS[name].run(arg, button).
// Each file adds the actions it owns. Optional rules, checked by render():
//   verb: the verb the button needs (a string, or a function of arg); without it the button is disabled
//   off():  a reason the button is unavailable right now ("" or nothing when it is available)
const ACTIONS = {};
const parseAct = (a) => { const i = a.indexOf(":"); return i < 0 ? [a, ""] : [a.slice(0, i), a.slice(i + 1)]; };

// Brief confirmation on the button that was pressed
function flash(el, text) {
    if (!el) return;
    if (el._flash) clearTimeout(el._flash.t);
    else el._flash = { html: el.innerHTML };
    el.innerHTML = `<svg class="ic"><use href="#i-check"/></svg>${esc(text)}`;
    el._flash.t = setTimeout(() => { el.innerHTML = el._flash.html; el._flash = null; }, 1800);
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch {}
        ta.remove();
        return ok;
    }
}
