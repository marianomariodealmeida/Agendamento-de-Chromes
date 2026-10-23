(function () {
  const { db } = window;
  let cache = null;

  async function carregar(force = false) {
    if (cache && !force) return cache;
    const { data } = await db.from("configuracoes_site").select("*").eq("id", 1).maybeSingle();
    cache = data || null;
    return cache;
  }

  function aplicar(cfg) {
    if (!cfg) return;
    const root = document.documentElement;

    root.style.setProperty("--primary", cfg.cor_primaria || "#2563eb");
    root.style.setProperty("--primary-2", cfg.cor_secundaria || "#06b6d4");
    root.style.setProperty("--primary-soft", hexToRgba(cfg.cor_primaria, 0.15));

    document.querySelectorAll("[data-site-name]").forEach((el) => {
      el.textContent = cfg.nome_site || "ChromeAgenda";
    });
    document.querySelectorAll("[data-home-title]").forEach((el) => {
      el.textContent = cfg.titulo_home || "";
    });
    document.querySelectorAll("[data-home-subtitle]").forEach((el) => {
      el.textContent = cfg.subtitulo_home || "";
    });
    document.querySelectorAll("[data-btn-primary]").forEach((el) => {
      el.textContent = cfg.texto_botao_primario || "Fazer agendamento";
    });
    document.querySelectorAll("[data-btn-secondary]").forEach((el) => {
      el.textContent = cfg.texto_botao_secundario || "Ver calendário";
    });
  }

  function hexToRgba(hex, a = 1) {
    if (!hex) return `rgba(37,99,235,${a})`;
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  window.SiteConfig = { carregar, aplicar };
})();
