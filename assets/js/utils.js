(function () {
  const U = {};

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Data local -> "YYYY-MM-DD" (sem bug de fuso) */
  U.toISODate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  /** "YYYY-MM-DD" -> Date local */
  U.parseISODate = (s) => new Date(s + "T00:00:00");

  /** "YYYY-MM-DD" -> "12/05/2026" */
  U.formatDate = (s) => {
    if (!s) return "";
    const d = U.parseISODate(s.slice(0, 10));
    return d.toLocaleDateString("pt-BR");
  };

  U.periodoLabel = (p) =>
    ({ manha: "Manhã", tarde: "Tarde", noite: "Noite" }[p] || p || "");

  U.escapeHtml = (str) =>
    String(str ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  U.toast = (msg, type = "info", ms = 3800) => {
    let host = document.querySelector(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .25s";
      setTimeout(() => el.remove(), 260);
    }, ms);
  };

  window.U = U;
})();
