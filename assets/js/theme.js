(function () {
  const root = document.documentElement;
  const KEY = "chromeagenda-theme";

  const apply = (theme) => {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  };

  const toggle = () => {
    const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    apply(current === "dark" ? "light" : "dark");
  };

  const init = () => {
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", toggle);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // permite alternar de qualquer lugar
  window.Theme = { toggle, apply };
// dentro de window.Theme, adicione:
function applyPrimaryColors(primary, secondary) {
  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-2", secondary);
  root.style.setProperty("--primary-soft", hexToRgba(primary, 0.15));
}
})();
