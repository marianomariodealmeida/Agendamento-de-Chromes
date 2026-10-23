(function () {
  const { db } = window;
  const U = window.U;

  /* ============ TABS ============ */
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".admin-panel").forEach((p) => (p.hidden = true));
      tab.classList.add("active");
      const el = document.getElementById("panel-" + tab.dataset.tab);
      if (el) el.hidden = false;
      if (tab.dataset.tab === "agendamentos") carregarAgendamentos();
    });
  });

  /* ============ INIT ============ */
  (async function init() {
    const ctx = await Auth.requireAdmin("../admin-login.html");
    if (!ctx) return;

    document.getElementById("admin-nome").textContent =
      ctx.perfil?.nome || ctx.session.user.email;
    document.getElementById("btn-sair").addEventListener("click", () =>
      Auth.logout("../index.html")
    );

    await Promise.all([carregarLayout(), carregarBanners(), carregarCarrinhos()]);
    await Promise.all([
      carregarUsuarios(),
      carregarChromebooks(),
      carregarEventos(),
      carregarHorarios(),
      carregarTurmas(),
    ]);
  })();

  /* ============================================================
     LAYOUT
     ============================================================ */
  async function carregarLayout() {
    const cfg = await SiteConfig.carregar(true);
    const form = document.getElementById("form-layout");
    if (!cfg || !form) return;

    form.nome_site.value = cfg.nome_site || "";
    form.titulo_home.value = cfg.titulo_home || "";
    form.subtitulo_home.value = cfg.subtitulo_home || "";
    form.texto_botao_primario.value = cfg.texto_botao_primario || "";
    form.texto_botao_secundario.value = cfg.texto_botao_secundario || "";
    form.cor_primaria.value = cfg.cor_primaria || "#2563eb";
    form.cor_secundaria.value = cfg.cor_secundaria || "#06b6d4";
    form.cor_primaria_hex.value = cfg.cor_primaria || "#2563eb";
    form.cor_secundaria_hex.value = cfg.cor_secundaria || "#06b6d4";

    form.querySelectorAll('input[type="color"]').forEach((c) => {
      c.addEventListener("input", () => {
        form[c.name + "_hex"].value = c.value;
      });
    });
    form.querySelectorAll("input[name$='_hex']").forEach((t) => {
      t.addEventListener("input", () => {
        const base = t.name.replace("_hex", "");
        if (/^#[0-9a-f]{6}$/i.test(t.value)) form[base].value = t.value;
      });
    });

    form.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        nome_site: form.nome_site.value.trim(),
        titulo_home: form.titulo_home.value.trim(),
        subtitulo_home: form.subtitulo_home.value.trim(),
        texto_botao_primario: form.texto_botao_primario.value.trim(),
        texto_botao_secundario: form.texto_botao_secundario.value.trim(),
        cor_primaria: form.cor_primaria_hex.value,
        cor_secundaria: form.cor_secundaria_hex.value,
      };
      const { error } = await db
        .from("configuracoes_site")
        .update(payload)
        .eq("id", 1);
      if (error) return U.toast(error.message, "error");
      await SiteConfig.carregar(true).then(SiteConfig.aplicar);
      U.toast("Layout atualizado!", "success");
    };
  }

  /* ============================================================
     BANNERS
     ============================================================ */
  async function carregarBanners() {
    const { data } = await db.from("banners").select("*").order("ordem");
    const el = document.getElementById("lista-banners");
    if (!el) return;

    if (!data?.length) {
      el.innerHTML = `<p class="empty">Nenhum banner cadastrado.</p>`;
      return;
    }
    el.innerHTML = data
      .map(
        (b) => `
      <div class="banner-item list-item">
        <img class="banner-thumb" src="${b.url}" alt="">
        <div class="grow">
          <div class="title">${U.escapeHtml(b.titulo || "Sem título")}</div>
          <div class="meta">${b.ativo ? "Ativo" : "Inativo"} · ordem ${b.ordem}</div>
        </div>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-ghost btn-sm" data-toggle="${b.id}" data-ativo="${b.ativo}">
            ${b.ativo ? "Desativar" : "Ativar"}
          </button>
          <button class="btn btn-danger btn-sm" data-del="${b.id}">Excluir</button>
        </div>
      </div>`
      )
      .join("");

    el.querySelectorAll("[data-toggle]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await db.from("banners").update({ ativo: btn.dataset.ativo !== "true" }).eq("id", btn.dataset.toggle);
        carregarBanners();
      })
    );
    el.querySelectorAll("[data-del]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Excluir banner?")) return;
        await db.from("banners").delete().eq("id", btn.dataset.del);
        carregarBanners();
      })
    );
  }

  document.getElementById("form-banner")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const file = form.arquivo.files?.[0];
    let url = form.url.value.trim();

    if (file) {
      const nome = `banner-${Date.now()}-${file.name}`;
      const { error } = await db.storage.from("banners").upload(nome, file);
      if (error) return U.toast(error.message, "error");
      const { data } = db.storage.from("banners").getPublicUrl(nome);
      url = data.publicUrl;
    }

    if (!url) return U.toast("Informe uma URL ou arquivo.", "error");

    const { error } = await db.from("banners").insert({
      url,
      titulo: form.titulo.value.trim() || null,
    });
    if (error) return U.toast(error.message, "error");

    form.reset();
    carregarBanners();
    U.toast("Banner adicionado!", "success");
  });

  /* ============================================================
     CARRINHOS
     ============================================================ */
  async function carregarCarrinhos() {
    const { data } = await db.from("carrinhos").select("*").order("nome");
    const list = data || [];
    document.getElementById("cr-total").textContent = `${list.length} carrinho(s)`;
    const host = document.getElementById("lista-carrinhos");
    const opts = document.getElementById("cb-carrinho");
    const evOpts = document.getElementById("ev-carrinho");

    const optsHtml = list
      .map((c) => `<option value="${c.id}">${U.escapeHtml(c.nome)}</option>`)
      .join("");
    if (opts) opts.innerHTML = `<option value="">— Sem carrinho —</option>${optsHtml}`;
    if (evOpts) evOpts.innerHTML = `<option value="">Todos os carrinhos</option>${optsHtml}`;

    if (!host) return;
    if (!list.length) {
      host.innerHTML = `<p class="empty">Nenhum carrinho cadastrado.</p>`;
      return;
    }
    host.innerHTML = list
      .map(
        (c) => `
      <div class="list-item">
        <div class="grow">
          <div class="title">${U.escapeHtml(c.nome)}</div>
          <div class="meta">${U.escapeHtml(c.descricao || "")} ${c.localizacao ? "· " + U.escapeHtml(c.localizacao) : ""}</div>
        </div>
        <button class="btn btn-danger btn-sm" data-del-carrinho="${c.id}">Excluir</button>
      </div>`
      )
      .join("");

    host.querySelectorAll("[data-del-carrinho]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Excluir carrinho? Os Chromebooks ficarão sem carrinho.")) return;
        await db.from("carrinhos").delete().eq("id", btn.dataset.delCarrinho);
        carregarCarrinhos();
        carregarChromebooks();
      })
    );
  }

  document.getElementById("form-carrinho")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const { error } = await db.from("carrinhos").insert({
      nome: form.nome.value.trim(),
      descricao: form.descricao.value.trim() || null,
      localizacao: form.localizacao.value.trim() || null,
    });
    if (error) return U.toast(error.message, "error");
    form.reset();
    carregarCarrinhos();
    U.toast("Carrinho criado!", "success");
  });

  /* ============================================================
     CHROMEBOOKS
     ============================================================ */
  async function carregarChromebooks() {
    const { data } = await db
      .from("chromebooks")
      .select("*, carrinho:carrinhos(nome)")
      .order("nome");
    const list = data || [];
    const el = document.getElementById("tabela-chromebooks");
    if (!el) return;

    document.getElementById("cb-total").textContent = `${list.length} Chromebook(s)`;

    if (!list.length) {
      el.innerHTML = `<tr><td colspan="7" class="empty">Nenhum Chromebook cadastrado.</td></tr>`;
      return;
    }
    el.innerHTML = list
      .map(
        (c) => `
      <tr>
        <td>${U.escapeHtml(c.nome)}</td>
        <td>${U.escapeHtml(c.numero_serie || "—")}</td>
        <td>${U.escapeHtml(c.numero_atribuido || "—")}</td>
        <td>${c.polegadas ?? "—"}"</td>
        <td>${U.escapeHtml(c.carrinho?.nome || "—")}</td>
        <td><span class="badge badge-info">${U.escapeHtml(c.status)}</span></td>
        <td><button class="btn btn-danger btn-sm" data-del-cb="${c.id}">Excluir</button></td>
      </tr>`
      )
      .join("");

    el.querySelectorAll("[data-del-cb]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Excluir Chromebook?")) return;
        await db.from("chromebooks").delete().eq("id", btn.dataset.delCb);
        carregarChromebooks();
      })
    );
  }

  document.getElementById("form-chromebook")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const { error } = await db.from("chromebooks").insert({
      nome: form.nome.value.trim(),
      numero_serie: form.numero_serie.value.trim() || null,
      numero_atribuido: form.numero_atribuido.value.trim() || null,
      polegadas: form.polegadas.value ? Number(form.polegadas.value) : null,
      carrinho_id: form.carrinho_id.value || null,
      status: form.status.value,
    });
    if (error) return U.toast(error.message, "error");
    form.reset();
    carregarChromebooks();
    U.toast("Chromebook adicionado!", "success");
  });

  /* ============================================================
     USUÁRIOS
     ============================================================ */
  async function carregarUsuarios() {
    const { data } = await db.from("perfis").select("*").order("created_at", { ascending: false });
    const el = document.getElementById("tabela-usuarios");
    if (!el) return;

    if (!data?.length) {
      el.innerHTML = `<tr><td colspan="5" class="empty">Nenhum usuário.</td></tr>`;
      return;
    }
    el.innerHTML = data
      .map(
        (u) => `
      <tr>
        <td>${U.escapeHtml(u.nome || "—")}</td>
        <td>${U.escapeHtml(u.email || "—")}</td>
        <td>
          <select class="select" data-cargo="${u.id}" style="padding:.3rem .5rem">
            <option value="professor" ${u.cargo === "professor" ? "selected" : ""}>Professor</option>
            <option value="admin" ${u.cargo === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </td>
        <td>${U.formatDate(u.created_at?.slice(0, 10))}</td>
        <td><button class="btn btn-ghost btn-sm" data-edit-user="${u.id}">Editar</button></td>
      </tr>`
      )
      .join("");

    el.querySelectorAll("[data-cargo]").forEach((sel) =>
      sel.addEventListener("change", async () => {
        await db.from("perfis").update({ cargo: sel.value }).eq("id", sel.dataset.cargo);
        U.toast("Cargo atualizado.", "success");
      })
    );

    el.querySelectorAll("[data-edit-user]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const u = data.find((x) => x.id === btn.dataset.editUser);
        const novo = prompt("Novo nome:", u.nome || "");
        if (novo === null) return;
        await db.from("perfis").update({ nome: novo.trim() }).eq("id", u.id);
        carregarUsuarios();
      })
    );
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  async function carregarEventos() {
    const { data } = await db
      .from("eventos_especiais")
      .select("*, carrinho:carrinhos(nome)")
      .order("data_inicio", { ascending: false });
    const el = document.getElementById("lista-eventos");
    if (!el) return;

    if (!data?.length) {
      el.innerHTML = `<p class="empty">Nenhum evento cadastrado.</p>`;
      return;
    }
    el.innerHTML = data
      .map(
        (e) => `
      <div class="list-item">
        <div class="grow">
          <div class="title">${U.escapeHtml(e.titulo)}</div>
          <div class="meta">
            ${U.formatDate(e.data_inicio)} → ${U.formatDate(e.data_fim)}
            · ${e.carrinho?.nome ? "Carrinho: " + U.escapeHtml(e.carrinho.nome) : "Todos os carrinhos"}
          </div>
        </div>
        <button class="btn btn-danger btn-sm" data-del-ev="${e.id}">Excluir</button>
      </div>`
      )
      .join("");

    el.querySelectorAll("[data-del-ev]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Excluir evento?")) return;
        await db.from("eventos_especiais").delete().eq("id", btn.dataset.delEv);
        carregarEventos();
      })
    );
  }

  document.getElementById("form-evento")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const { error } = await db.from("eventos_especiais").insert({
      titulo: form.titulo.value.trim(),
      descricao: form.descricao.value.trim() || null,
      data_inicio: form.data_inicio.value,
      data_fim: form.data_fim.value,
      carrinho_id: form.carrinho_id.value || null,
    });
    if (error) return U.toast(error.message, "error");
    form.reset();
    carregarEventos();
    U.toast("Evento criado!", "success");
  });

  /* ============================================================
     BLOQUEIO DE HORAS
     ============================================================ */
  document.getElementById("form-bloqueio")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const horas = Number(e.target.bloqueio_horas.value);
    const { error } = await db
      .from("configuracoes_site")
      .update({ bloqueio_horas: horas })
      .eq("id", 1);
    if (error) return U.toast(error.message, "error");
    U.toast("Bloqueio atualizado.", "success");
  });

  /* ============================================================
     HORÁRIOS
     ============================================================ */
  async function carregarHorarios() {
    const { data } = await db
      .from("horarios_aula")
      .select("*")
      .order("segmento")
      .order("ordem");

    const grupos = (data || []).reduce((acc, h) => {
      (acc[h.segmento] = acc[h.segmento] || []).push(h);
      return acc;
    }, {});

    const labels = { infantil: "Infantil", fund1: "Fund. 1", fund2: "Fund. 2", medio: "Médio", contraturno: "Contraturno" };

    const host = document.getElementById("lista-horarios");
    if (!host) return;

    if (!Object.keys(grupos).length) {
      host.innerHTML = `<p class="empty">Nenhum horário cadastrado.</p>`;
      return;
    }

    host.innerHTML = Object.entries(grupos)
      .map(
        ([seg, items]) => `
      <div style="margin-bottom:1rem">
        <strong style="font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">${labels[seg] || seg}</strong>
        <div class="list" style="margin-top:.5rem">
          ${items
            .map(
              (h) => `
            <div class="list-item">
              <span class="badge badge-info">${U.escapeHtml(h.rotulo)}</span>
              <span class="grow">${h.hora_inicio} → ${h.hora_fim}</span>
              <button class="btn btn-danger btn-sm" data-del-hr="${h.id}">×</button>
            </div>`
            )
            .join("")}
        </div>
      </div>`
      )
      .join("");

    host.querySelectorAll("[data-del-hr]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await db.from("horarios_aula").delete().eq("id", btn.dataset.delHr);
        carregarHorarios();
      })
    );
  }

  document.getElementById("form-horario")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const { error } = await db.from("horarios_aula").insert({
      segmento: form.segmento.value,
      rotulo: form.rotulo.value.trim(),
      hora_inicio: form.hora_inicio.value,
      hora_fim: form.hora_fim.value,
      ordem: Number(form.ordem.value) || 0,
    });
    if (error) return U.toast(error.message, "error");
    form.reset();
    carregarHorarios();
    U.toast("Horário adicionado!", "success");
  });

  /* ============================================================
     TURMAS
     ============================================================ */
  async function carregarTurmas() {
    const { data } = await db.from("turmas").select("*").order("nome");
    const el = document.getElementById("tabela-turmas");
    if (!el) return;

    if (!data?.length) {
      el.innerHTML = `<tr><td colspan="4" class="empty">Nenhuma turma.</td></tr>`;
      return;
    }
    el.innerHTML = data
      .map(
        (t) => `
      <tr>
        <td>${U.escapeHtml(t.nome)}</td>
        <td>${U.escapeHtml(t.segmento)}</td>
        <td>${U.escapeHtml(t.turno)}</td>
        <td><button class="btn btn-danger btn-sm" data-del-tm="${t.id}">Excluir</button></td>
      </tr>`
      )
      .join("");

    el.querySelectorAll("[data-del-tm]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Excluir turma?")) return;
        await db.from("turmas").delete().eq("id", btn.dataset.delTm);
        carregarTurmas();
      })
    );
  }

  document.getElementById("form-turma")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const { error } = await db.from("turmas").insert({
      nome: form.nome.value.trim(),
      segmento: form.segmento.value,
      turno: form.turno.value,
    });
    if (error) return U.toast(error.message, "error");
    form.reset();
    carregarTurmas();
    U.toast("Turma adicionada!", "success");
  });

  /* ============================================================
     AGENDAMENTOS (mantido)
     ============================================================ */
  async function carregarAgendamentos() {
    const filtro = document.getElementById("filtro-status")?.value || "";
    let q = db
      .from("agendamentos")
      .select("*, turma:turmas(nome), horario:horarios_aula(rotulo,hora_inicio,hora_fim), carrinho:carrinhos(nome)")
      .order("data", { ascending: false });
    if (filtro) q = q.eq("status", filtro);
    const { data } = await q;
    const el = document.getElementById("tabela-agendamentos");
    if (!el) return;

    if (!data?.length) {
      el.innerHTML = `<tr><td colspan="8" class="empty">Nenhum agendamento.</td></tr>`;
      return;
    }
    el.innerHTML = data
      .map(
        (a) => `
      <tr>
        <td>${U.formatDate(a.data)}</td>
        <td>${a.horario ? `${a.horario.rotulo} (${a.horario.hora_inicio}–${a.horario.hora_fim})` : U.periodoLabel(a.periodo)}</td>
        <td>${U.escapeHtml(a.professor_nome || "—")}</td>
        <td>${U.escapeHtml(a.turma?.nome || "—")}</td>
        <td>${a.quantidade}</td>
        <td>${U.escapeHtml(a.carrinho?.nome || "—")}</td>
        <td><span class="badge badge-${a.status}">${a.status}</span></td>
        <td>
          ${a.status !== "aprovado" ? `<button class="btn btn-success btn-sm" data-acao="aprovado" data-id="${a.id}">Aprovar</button>` : ""}
          ${a.status !== "cancelado" ? `<button class="btn btn-danger btn-sm" data-acao="cancelado" data-id="${a.id}">Cancelar</button>` : ""}
        </td>
      </tr>`
      )
      .join("");

    el.querySelectorAll("[data-acao]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const { error } = await db
          .from("agendamentos")
          .update({ status: btn.dataset.acao })
          .eq("id", btn.dataset.id);
        if (error) return U.toast(error.message, "error");
        carregarAgendamentos();
      })
    );
  }

  document.getElementById("filtro-status")?.addEventListener("change", carregarAgendamentos);
})();
