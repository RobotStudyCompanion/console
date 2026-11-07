// RSC Console · Small helpers: DOM lookups, safe localStorage, escaping, media queries, button flash.
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

// Brief confirmation on the button that was pressed
function flash(el, text) {
    if (!el) return;
    if (el._flash) clearTimeout(el._flash.t);
    else el._flash = { html: el.innerHTML };
    el.innerHTML = `<svg class="ic"><use href="#i-check"/></svg>${esc(text)}`;
    el._flash.t = setTimeout(() => { el.innerHTML = el._flash.html; el._flash = null; }, 1800);
}
