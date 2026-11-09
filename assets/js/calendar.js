(function () {
  const { db } = window;
  const U = window.U;

  const el = {
    grid: document.getElementById("calendar-grid"),
    label: document.getElementById("calendar-label"),
    prev: document.getElementById("cal-prev"),
    next: document.getElementById("cal-next"),
    today: document.getElementById("cal-today"),
    modal: document.getElementById("day-modal"),
    modalTitle: document.getElementById("day-modal-title"),
    modalBody: document.getElementById("day-modal-body"),
    modalClose: document.getElementById("day-modal-close"),
  };

  if (!el.grid) return;

  const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const PERIODO_DOT = { manha: "dot-manha", tarde: "dot-tarde", noite: "dot-noite" };

  const state = { ref: new Date(), items: [], loaded: false };
  let lastFocused = null;

  function monthRange(ref) {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + 41);
    return { first, gridStart, gridEnd };
  }

  async function fetchMonth() {
    const { gridStart, gridEnd } = monthRange(state.ref);

    // View pública: não expõe nome de professor, sala nem observações.
    const { data, error } = await db
      .from("agenda_publica")
      .select("data, periodo, quantidade, status")
      .gte("data", U.toISODate(gridStart))
      .lte("data", U.toISODate(gridEnd))
      .order("data", { ascending: true });

    if (error) {
      console.error("[calendar]", error);
      U.toast("Não foi possível carregar o calendário.", "error");
      state.items = [];
    } else {
      state.items = data || [];
    }

    state.loaded = true;
    render();
  }

  function render() {
    const { first, gridStart } = monthRange(state.ref);

    el.label.textContent = first.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    const byDate = {};
    for (const item of state.items) {
      const key = String(item.data).slice(0, 10);
      (byDate[key] = byDate[key] || []).push(item);
    }

    const todayISO = U.toISODate(new Date());
    const frag = document.createDocumentFragment();

    WEEKDAYS.forEach((w) => {
      const h = document.createElement("div");
      h.className = "cal-weekday";
      h.textContent = w;
      frag.appendChild(h);
    });

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = U.toISODate(d);
      const dayItems = byDate[iso] || [];

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-day";
      if (d.getMonth() !== first.getMonth()) cell.classList.add("is-outside");
      if (iso === todayISO) cell.classList.add("is-today");
      cell.setAttribute("aria-label", `Dia ${d.getDate()} — ${dayItems.length} agendamento(s)`);

      const num = document.createElement("span");
      num.className = "cal-day-num";
      num.textContent = d.getDate();
      cell.appendChild(num);

      if (dayItems.length) {
        const dots = document.createElement("div");
        dots.className = "cal-dots";
        dayItems.slice(0, 4).forEach((it) => {
          const dot = document.createElement("span");
          dot.className = `cal-dot ${PERIODO_DOT[it.periodo] || ""}`;
          dots.appendChild(dot);
        });
        cell.appendChild(dots);

        const count = document.createElement("span");
        count.className = "cal-count";
        count.textContent = dayItems.length > 4 ? "4+" : String(dayItems.length);
        cell.appendChild(count);
      }

      cell.addEventListener("click", () => openDay(iso, d, dayItems));
      frag.appendChild(cell);
    }

    el.grid.innerHTML = "";
    el.grid.appendChild(frag);
  }

  function openDay(iso, dateObj, items) {
    if (!el.modal) return;

    el.modalTitle.textContent = dateObj.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });

    const hoje = U.toISODate(new Date());
    const podeAgendar = iso >= hoje; // hoje ou futuro

    const itemsHtml = items.length
      ? `<div class="list">
          ${items
            .map(
              (it) => `
            <div class="list-item">
              <span class="badge badge-info">${U.escapeHtml(U.periodoLabel(it.periodo))}</span>
              <div class="grow">
                <div class="title">${U.escapeHtml(String(it.quantidade || 1))} Chromebook(s)</div>
                <div class="meta">${
                  it.status === "pendente" ? "Aguardando aprovação" : "Confirmado"
                }</div>
              </div>
            </div>`
            )
            .join("")}
        </div>`
      : `<p class="empty">Nenhum agendamento neste dia.</p>`;

    const btnHtml = podeAgendar
      ? `<a class="btn btn-primary btn-block" style="margin-top:1rem"
           href="agendamento-usuario.html?data=${iso}">Agendar neste dia</a>`
      : `<p class="empty" style="margin-top:1rem">Este dia já passou — não é possível agendar.</p>`;

    el.modalBody.innerHTML = itemsHtml + btnHtml;
    lastFocused = document.activeElement;
    el.modal.hidden = false;
    el.modalClose?.focus();
  }

  function closeModal() {
    if (!el.modal || el.modal.hidden) return;
    el.modal.hidden = true;
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  el.prev?.addEventListener("click", () => {
    state.ref = new Date(state.ref.getFullYear(), state.ref.getMonth() - 1, 1);
    fetchMonth();
  });
  el.next?.addEventListener("click", () => {
    state.ref = new Date(state.ref.getFullYear(), state.ref.getMonth() + 1, 1);
    fetchMonth();
  });
  el.today?.addEventListener("click", () => {
    state.ref = new Date();
    fetchMonth();
  });
  el.modalClose?.addEventListener("click", closeModal);
  el.modal?.addEventListener("click", (e) => {
    if (e.target === el.modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (!el.modal || el.modal.hidden) return;
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    if (e.key !== "Tab") return;

    const focusable = Array.from(
      el.modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  fetchMonth();
})();
