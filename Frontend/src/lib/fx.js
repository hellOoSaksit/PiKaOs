/* PiKaOs — ES module (migrated from GuildOS/fx.js). */


/* ============================================================
   FX.JS — responsive shell helpers (no framework).
   Injects a hamburger + scrim for the off-canvas sidebar on
   small screens, and wires open/close behaviour.
   ============================================================ */
(function () {
  function init() {
    if (document.getElementById("nav-burger")) return;
    if (!document.body) return;

    var burger = document.createElement("button");
    burger.id = "nav-burger";
    burger.className = "nav-burger";
    burger.setAttribute("aria-label", "เปิด/ปิดเมนู");
    burger.innerHTML = "<span></span><span></span><span></span>";

    var scrim = document.createElement("div");
    scrim.className = "nav-scrim";

    document.body.appendChild(burger);
    document.body.appendChild(scrim);

    burger.addEventListener("click", function (e) {
      e.stopPropagation();
      document.body.classList.toggle("nav-open");
    });
    scrim.addEventListener("click", function () {
      document.body.classList.remove("nav-open");
    });
    // close the drawer after choosing a destination
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".nav-item")) {
        document.body.classList.remove("nav-open");
      }
    });
    // tidy up if the viewport grows past the breakpoint
    window.addEventListener("resize", function () {
      if (window.innerWidth > 980) document.body.classList.remove("nav-open");
    });
    // close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") document.body.classList.remove("nav-open");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // re-assert in case the body was re-rendered late
  setTimeout(init, 600);
  setTimeout(init, 1500);
})();
