(function () {
  const { db } = window;
  const U = window.U;

  /** Só aceita http/https; evita javascript:, data: e injeção de atributo. */
  function safeUrl(value) {
    try {
      const url = new URL(String(value || "").trim(), window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (e) {
      return "";
    }
  }

  async function carregarAtivos() {
    const { data } = await db
      .from("banners")
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: false });
    return data || [];
  }

  async function renderHero(selector) {
    const host = document.querySelector(selector);
    if (!host) return;

    const banners = (await carregarAtivos()).filter((b) => safeUrl(b.url));

    // Fallback: sem banners → mantém comportamento atual
    if (!banners.length) {
      host.innerHTML = `<span class="glyph">💻</span>`;
      return;
    }

    // Com banners → slider automático
    host.innerHTML = `
      <div class="hero-slider" id="hero-slider">
        ${banners
          .map(
            (b, i) => `
          <div class="hero-slide${i === 0 ? " active" : ""}" data-index="${i}">
            <img src="${U.escapeHtml(safeUrl(b.url))}" alt="${U.escapeHtml(b.titulo || "")}" loading="${i === 0 ? "eager" : "lazy"}">
          </div>`
          )
          .join("")}
        ${
          banners.length > 1
            ? `<div class="hero-dots">
                 ${banners.map((_, i) => `<button class="hero-dot${i === 0 ? " active" : ""}" data-goto="${i}" aria-label="Slide ${i + 1}"></button>`).join("")}
               </div>`
            : ""
        }
      </div>
    `;

    if (banners.length <= 1) return;

    let current = 0;
    const slides = host.querySelectorAll(".hero-slide");
    const dots = host.querySelectorAll(".hero-dot");

    const go = (i) => {
      slides[current]?.classList.remove("active");
      dots[current]?.classList.remove("active");
      current = (i + slides.length) % slides.length;
      slides[current]?.classList.add("active");
      dots[current]?.classList.add("active");
    };

    dots.forEach((d) =>
      d.addEventListener("click", () => go(Number(d.dataset.goto)))
    );

    let timer = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const play = () => {
      if (reduceMotion || timer) return;
      timer = setInterval(() => go(current + 1), 5000);
    };
    const pause = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    play();
    host.addEventListener("mouseenter", pause);
    host.addEventListener("mouseleave", play);
    host.addEventListener("focusin", pause);
    host.addEventListener("focusout", play);
    document.addEventListener("visibilitychange", () =>
      document.hidden ? pause() : play()
    );
  }

  window.Banners = { carregarAtivos, renderHero };
})();
