// RSC Console · Start-up. Runs last.
"use strict";

// ---- Start ----
// rsc.ee/app.html#rsc-shiny or #rsc-shiny:8765 fills in the address.
// The token is never taken from the URL.
if (location.hash.length > 1) {
    const [h, p] = decodeURIComponent(location.hash.slice(1)).split(":");
    if (h) $("#cfHost").value = h.includes(".") || h === "localhost" ? h : `${h}.local`;
    if (p) $("#cfPort").value = p;
    $("#cfHost").dispatchEvent(new Event("input"));
}
applyTheme();
// Fills the Settings fields, among others
render();
applyDock();
applyFilter();
renderRecent();
go("connect");
