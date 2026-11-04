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
  // Vercel Web Analytics queue (the script itself loads deferred).
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
})();
