(function () {
  const { db } = window;
  const U = window.U;

  const tbody = document.getElementById("tabela-agendamentos");
  if (!tbody) return;

  const statsEl = {
    total: document.getElementById("stat-total"),
    pendentes: document.getElementById("stat-pendentes"),
    aprovados: document.getElementById("stat-aprovados"),
    usuarios: document.getElementById("stat-usuarios"),
  };

  async function init() {
    const ctx = await Auth.requireAdmin("../admin-login.html");
    if (!ctx) return;

    document.getElementById("admin-nome").textContent =
      ctx.perfil?.nome || ctx.session.user.email;

    document.getElementById("btn-sair").addEventListener("click", () =>
      Auth.logout("../index.html")
    );

    document.getElementById("filtro-status").addEventListener("change", carregar);
    await carregar();
  }

  async function carregar() {
    const filtro = document.getElementById("filtro-status").value;

    let query = db.from("agendamentos").select("*").order("data", { ascending: false });
    if (filtro) query = query.eq("status", filtro);

    const [{ data: ags, error }, { count: usuarios }] = await Promise.all([
      query,
      db.from("perfis").select("*", { count: "exact", head: true }),
    ]);

    if (error) {
      tbody.innerHTML = `<tr><td colspan="6">Erro: ${U.escapeHtml(error.message)}</td></tr>`;
      return;
    }

    const lista = ags || [];

    if (statsEl.total) statsEl.total.textContent = lista.length;
    if (statsEl.pendentes)
      statsEl.pendentes.textContent = lista.filter((a) => a.status === "pendente").length;
    if (statsEl.aprovados)
      statsEl.aprovados.textContent = lista.filter((a) => a.status === "aprovado").length;
    if (statsEl.usuarios) statsEl.usuarios.textContent = usuarios ?? "—";

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted)">Nenhum agendamento encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista
      .map(
        (a) => `
      <tr>
        <td>${U.formatDate(a.data)}</td>
        <td>${U.escapeHtml(U.periodoLabel(a.periodo))}</td>
        <td>${U.escapeHtml(a.professor_nome || "—")}</td>
        <td>${U.escapeHtml(String(a.quantidade || 1))}${a.sala ? " · " + U.escapeHtml(a.sala) : ""}</td>
        <td><span class="badge badge-${a.status}">${U.escapeHtml(a.status)}</span></td>
        <td style="white-space:nowrap">
          ${
            a.status !== "aprovado"
              ? `<button class="btn btn-success btn-sm" data-acao="aprovado" data-id="${a.id}">Aprovar</button>`
              : ""
          }
          ${
            a.status !== "cancelado"
              ? `<button class="btn btn-danger btn-sm" data-acao="cancelado" data-id="${a.id}">Cancelar</button>`
              : ""
          }
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-acao]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const { error } = await db
          .from("agendamentos")
          .update({ status: btn.dataset.acao })
          .eq("id", btn.dataset.id);

        if (error) {
          btn.disabled = false;
          return U.toast("Erro: " + error.message, "error");
        }
        U.toast("Status atualizado.", "success");
        await carregar();
      });
    });
  }

  init();
})();
