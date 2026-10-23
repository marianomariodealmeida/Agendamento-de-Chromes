(function () {
  const { db } = window;
  const U = window.U;

  const form = document.getElementById("form-agendamento");
  const listEl = document.getElementById("meus-agendamentos");
  if (!form && !listEl) return;

  let session = null;
  let perfil = null;

  async function init() {
    session = await Auth.requireAuth("login.html");
    if (!session) return;

    perfil = await Auth.getPerfil(session.user.id);

    // Pré-preenche a data vinda da URL (?data=YYYY-MM-DD)
    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get("data");
    if (dataParam && form) form.data.value = dataParam;
    else if (form) form.data.value = U.toISODate(new Date());

    if (form) form.addEventListener("submit", criar);
    await carregar();
  }

  async function criar(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');

    const payload = {
      usuario_id: session.user.id,
      professor_nome: perfil?.nome || session.user.email,
      data: form.data.value,
      periodo: form.periodo.value,
      quantidade: Number(form.quantidade.value) || 1,
      sala: form.sala.value.trim() || null,
      observacoes: form.observacoes.value.trim() || null,
      status: "pendente",
    };

    if (!payload.data) return U.toast("Escolha uma data.", "error");
    if (payload.quantidade < 1 || payload.quantidade > 40)
      return U.toast("Quantidade deve ser entre 1 e 40.", "error");

    btn.disabled = true;
    btn.textContent = "Enviando...";

    const { error } = await db.from("agendamentos").insert(payload);

    btn.disabled = false;
    btn.textContent = "Solicitar agendamento";

    if (error) return U.toast("Erro: " + error.message, "error");

    U.toast("Agendamento solicitado!", "success");
    form.reset();
    form.data.value = U.toISODate(new Date());
    await carregar();
  }

  async function carregar() {
    if (!listEl) return;

    const { data, error } = await db
      .from("agendamentos")
      .select("*")
      .eq("usuario_id", session.user.id)
      .order("data", { ascending: false });

    if (error) {
      listEl.innerHTML = `<p class="empty">Erro ao carregar: ${U.escapeHtml(error.message)}</p>`;
      return;
    }

    if (!data || !data.length) {
      listEl.innerHTML = `<p class="empty">Você ainda não fez nenhum agendamento.</p>`;
      return;
    }

    listEl.innerHTML = data
      .map(
        (it) => `
      <div class="list-item">
        <span class="badge badge-${it.status}">${U.escapeHtml(it.status)}</span>
        <div class="grow">
          <div class="title">${U.formatDate(it.data)} — ${U.escapeHtml(U.periodoLabel(it.periodo))}</div>
          <div class="meta">
            ${U.escapeHtml(String(it.quantidade))} Chromebook(s)
            ${it.sala ? " • Sala " + U.escapeHtml(it.sala) : ""}
          </div>
        </div>
        ${
          it.status !== "cancelado"
            ? `<button class="btn btn-danger btn-sm" data-cancelar="${it.id}">Cancelar</button>`
            : ""
        }
      </div>`
      )
      .join("");

    listEl.querySelectorAll("[data-cancelar]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Cancelar este agendamento?")) return;
        btn.disabled = true;
        const { error } = await db
          .from("agendamentos")
          .update({ status: "cancelado" })
          .eq("id", btn.dataset.cancelar);
        if (error) {
          btn.disabled = false;
          return U.toast("Erro: " + error.message, "error");
        }
        U.toast("Agendamento cancelado.", "info");
        await carregar();
      });
    });
  }

  init();
})();
