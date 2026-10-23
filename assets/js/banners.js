(function () {
  const { db } = window;

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

    const banners = await carregarAtivos();

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
            <img src="${b.url}" alt="${(b.titulo || "").replace(/"/g, "&quot;")}" loading="${i === 0 ? "eager" : "lazy"}">
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

    let timer = setInterval(() => go(current + 1), 5000);
    host.addEventListener("mouseenter", () => clearInterval(timer));
    host.addEventListener("mouseleave", () => {
      timer = setInterval(() => go(current + 1), 5000);
    });
  }

  window.Banners = { carregarAtivos, renderHero };
})();
