(function () {
  const root = document.documentElement;
  const KEY = "chromeagenda-theme";

  const current = () =>
    root.getAttribute("data-theme") === "dark" ? "dark" : "light";

  const syncButton = () => {
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.setAttribute("aria-pressed", String(current() === "dark"));
  };

  const apply = (theme) => {
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {
      /* modo privado / storage bloqueado */
    }
    syncButton();
  };

  const toggle = () => apply(current() === "dark" ? "light" : "dark");

  const init = () => {
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", toggle);
    syncButton();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.Theme = { toggle, apply, current };
})();
