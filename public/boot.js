// Runs before first paint (no module, no build): apply the saved theme so there is no flash.
(function () {
  var root = document.documentElement;
  try {
    var s = JSON.parse(localStorage.getItem("sonata:v12:settings") || "{}");
    var t = s.theme === "dark" || s.theme === "light" ? s.theme : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.dataset.theme = t;
    root.dataset.accent = s.accentTheme || "blue";
    if (s.uiText) root.dataset.text = s.uiText;
    if (s.language === "fil") root.lang = "fil";
  } catch (e) { /* storage blocked: defaults apply */ }
  // If the app's own files fail before it starts (no connection on a first visit, or a browser too old
  // to run it), say so instead of leaving a blank screen. main.js takes over once the app is ready.
  var said = false;
  function fail(old) {
    if (said || root.dataset.ready || !document.body) return;
    said = true;
    var p = document.createElement("p");
    p.className = "boot-error";
    p.setAttribute("role", "alert");
    p.style.cssText = "margin:0;padding:16px;text-align:center;font:600 16px system-ui,sans-serif";
    p.textContent = old
      ? "Sonata couldn't start in this browser. Please update it, or open Sonata in a current Chrome, Safari, Edge or Firefox."
      : "Sonata couldn't load. Check your connection, then reload the page.";
    document.body.insertBefore(p, document.body.firstChild);
  }
  window.addEventListener("error", function (e) {
    var el = e.target;
    if (el && el !== window && el.tagName === "SCRIPT" && /\/(assets|js)\//.test(el.src || "")) fail(false);
    else if (el === window && /SyntaxError/.test(String(e.message || "")) && /\/(assets|js)\//.test(e.filename || "")) fail(true);
  }, true);
  // Vercel Web Analytics queue (the script itself loads deferred).
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
})();
