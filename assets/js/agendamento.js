/* ============================================================
   agendamento.js — Painel do professor
   - Cria agendamentos com turma, horário de aula e carrinho
   - Valida antecedência mínima (bloqueio_horas)
   - Valida eventos especiais e conflitos via RPC
   - Lista e permite cancelar agendamentos próprios
   ============================================================ */
(function () {
  const { db } = window;
  const U = window.U;

  const form     = document.getElementById("form-agendamento");
  const listEl   = document.getElementById("meus-agendamentos");
  const avisoEl  = document.getElementById("aviso-bloqueio");

  // Se não há nem formulário nem lista, não faz nada (evita erro em outras páginas)
  if (!form && !listEl) return;

  /* ---------- Refs dos selects ---------- */
  const selTurma    = document.getElementById("turma");
  const selCarrinho = document.getElementById("carrinho");
  const selHorario  = document.getElementById("horario");
  const selPeriodo  = document.getElementById("periodo"); // opcional (fallback antigo)

  /* ---------- Estado ---------- */
  let session = null;
  let perfil  = null;
  let turmas  = [];
  let carrinhos = [];

  const SEGMENTO_LABEL = {
    infantil: "Educação Infantil",
    fund1: "Fundamental 1",
    fund2: "Fundamental 2",
    medio: "Ensino Médio",
    contraturno: "Contraturno",
  };

  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    session = await Auth.requireAuth("login.html");
    if (!session) return;

    perfil = await Auth.getPerfil(session.user.id);

    // Carrega turmas e carrinhos em paralelo
    const [{ data: _carrinhos }, _turmas] = await Promise.all([
      db.from("carrinhos").select("*").eq("ativo", true).order("nome"),
      Horarios.listarTurmas(),
    ]);

    carrinhos = _carrinhos || [];
    turmas    = _turmas   || [];

    preencherSelects();

    // Preenche data (padrão: hoje; ou ?data=YYYY-MM-DD vindo do calendário)
    if (form) {
      const params = new URLSearchParams(window.location.search);
      const dataParam = params.get("data");
      form.data.value = dataParam || U.toISODate(new Date());
    }

    // Eventos
    selTurma?.addEventListener("change", aoTrocarTurma);
    form?.addEventListener("submit", criar);

    await carregar();
  }

  /* ============================================================
     SELECTS
     ============================================================ */
  function preencherSelects() {
    if (selTurma) {
      selTurma.innerHTML =
        `<option value="">Selecione a turma...</option>` +
        turmas
          .map(
            (t) =>
              `<option value="${t.id}" data-segmento="${t.segmento}" data-turno="${t.turno}">` +
              `${U.escapeHtml(t.nome)} — ${U.escapeHtml(SEGMENTO_LABEL[t.segmento] || t.segmento)} (${t.turno})` +
              `</option>`
          )
          .join("");
    }

    if (selCarrinho) {
      selCarrinho.innerHTML =
        `<option value="">Selecione o carrinho...</option>` +
        carrinhos
          .map((c) => `<option value="${c.id}">${U.escapeHtml(c.nome)}</option>`)
          .join("");
    }

    if (selHorario) {
      selHorario.innerHTML = `<option value="">Selecione a turma primeiro...</option>`;
      selHorario.disabled = true;
    }
  }

  async function aoTrocarTurma() {
    if (!selHorario) return;

    const opt = selTurma.options[selTurma.selectedIndex];
    const segmento = opt?.dataset.segmento;

    if (!segmento) {
      selHorario.innerHTML = `<option value="">Selecione a turma primeiro...</option>`;
      selHorario.disabled = true;
      return;
    }

    selHorario.disabled = true;
    selHorario.innerHTML = `<option value="">Carregando horários...</option>`;

    const horarios = await Horarios.listarPorSegmento(segmento);

    if (!horarios.length) {
      selHorario.innerHTML = `<option value="">Nenhum horário cadastrado para ${U.escapeHtml(SEGMENTO_LABEL[segmento] || segmento)}</option>`;
      return;
    }

    selHorario.innerHTML =
      `<option value="">Selecione o horário...</option>` +
      horarios
        .map(
          (h) =>
            `<option value="${h.id}" data-inicio="${h.hora_inicio}" data-fim="${h.hora_fim}">` +
            `${U.escapeHtml(h.rotulo)} (${h.hora_inicio} – ${h.hora_fim})` +
            `</option>`
        )
        .join("");
    selHorario.disabled = false;
  }

  /* ============================================================
     CRIAÇÃO DO AGENDAMENTO
     ============================================================ */
  async function criar(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');

    /* ---- Coleta ---- */
    const dataStr    = form.data.value;
    const turmaId    = selTurma?.value || null;
    const horarioId  = selHorario?.value || null;
    const carrinhoId = selCarrinho?.value || null;
    const quantidade = Number(form.quantidade.value) || 1;
    const sala       = form.sala.value.trim() || null;
    const observacoes= form.observacoes.value.trim() || null;

    /* ---- Validações básicas ---- */
    if (!dataStr)    return U.toast("Escolha uma data.", "error");
    if (!turmaId)    return U.toast("Selecione a turma.", "error");
    if (!horarioId)  return U.toast("Selecione o horário de aula.", "error");
    if (!carrinhoId) return U.toast("Selecione o carrinho.", "error");
    if (quantidade < 1 || quantidade > 40)
      return U.toast("Quantidade deve ser entre 1 e 40.", "error");

    /* ---- Bloqueio antecipado (bloqueio_horas) ---- */
    const horasBloq = await Horarios.bloqueioHoras();

    // Combina data + hora de início do horário selecionado
    const horarioOpt = selHorario.options[selHorario.selectedIndex];
    const horaInicio = horarioOpt?.dataset.inicio || "00:00";
    const dataHoraAgendada = new Date(`${dataStr}T${horaInicio}:00`);
    const agora = new Date();
    const diffHoras = (dataHoraAgendada - agora) / 36e5;

    if (diffHoras < horasBloq) {
      const msg =
        `Antecedência mínima de ${horasBloq}h. ` +
        `Escolha uma data/horário a partir de ` +
        new Date(agora.getTime() + horasBloq * 36e5).toLocaleString("pt-BR");

      if (avisoEl) {
        avisoEl.style.display = "block";
        avisoEl.textContent = "⚠️ " + msg;
      }
      return U.toast(msg, "error", 5500);
    } else if (avisoEl) {
      avisoEl.style.display = "none";
    }

    /* ---- Eventos especiais ---- */
    const eventos = await Horarios.eventosDoDia(dataStr, carrinhoId);
    if (eventos.length) {
      const ev = eventos[0];
      const msg = `Data bloqueada: ${ev.titulo} (${U.formatDate(ev.data_inicio)} → ${U.formatDate(ev.data_fim)})`;
      if (avisoEl) {
        avisoEl.style.display = "block";
        avisoEl.textContent = "🚫 " + msg;
      }
      return U.toast(msg, "error", 5500);
    } else if (avisoEl) {
      avisoEl.style.display = "none";
    }

    /* ---- Conflito (RPC) ---- */
    const { data: conflito, error: rpcErr } = await db.rpc(
      "verificar_conflito_agendamento",
      {
        p_data: dataStr,
        p_carrinho_id: carrinhoId,
        p_horario_id: horarioId,
      }
    );

    if (rpcErr) {
      console.warn("[agendamento] RPC erro:", rpcErr.message);
    } else if (conflito) {
      return U.toast(
        "Este carrinho já possui agendamento neste dia/horário.",
        "error",
        5000
      );
    }

    /* ---- Envia ---- */
    const payload = {
      usuario_id: session.user.id,
      professor_nome: perfil?.nome || session.user.email,
      data: dataStr,
      periodo: "aula", // horário de aula substitui o turno genérico
      quantidade,
      sala,
      observacoes,
      turma_id:    turmaId,
      horario_id:  horarioId,
      carrinho_id: carrinhoId,
      status: "pendente",
    };

    btn.disabled = true;
    btn.textContent = "Enviando...";

    const { error } = await db.from("agendamentos").insert(payload);

    btn.disabled = false;
    btn.textContent = "Solicitar agendamento";

    if (error) return U.toast("Erro: " + error.message, "error", 6000);

    U.toast("Agendamento solicitado!", "success");
    form.reset();
    form.data.value = U.toISODate(new Date());
    selHorario.innerHTML = `<option value="">Selecione a turma primeiro...</option>`;
    selHorario.disabled = true;
    if (avisoEl) avisoEl.style.display = "none";

    await carregar();
  }

  /* ============================================================
     LISTAGEM
     ============================================================ */
  async function carregar() {
    if (!listEl) return;

    const { data, error } = await db
      .from("agendamentos")
      .select(
        "*, turma:turmas(nome,segmento), horario:horarios_aula(rotulo,hora_inicio,hora_fim), carrinho:carrinhos(nome)"
      )
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

    listEl.innerHTML = data.map(renderItem).join("");

    listEl.querySelectorAll("[data-cancelar]").forEach((btn) => {
      btn.addEventListener("click", () => cancelar(btn));
    });
  }

  function renderItem(it) {
    const horarioTxt = it.horario
      ? `${U.escapeHtml(it.horario.rotulo)} (${it.horario.hora_inicio}–${it.horario.hora_fim})`
      : U.escapeHtml(U.periodoLabel(it.periodo));

    const turmaTxt = it.turma?.nome
      ? `Turma ${U.escapeHtml(it.turma.nome)}`
      : "";

    const carrinhoTxt = it.carrinho?.nome
      ? `Carrinho ${U.escapeHtml(it.carrinho.nome)}`
      : "";

    const meta = [
      `${it.quantidade} Chromebook(s)`,
      turmaTxt,
      carrinhoTxt,
      it.sala ? "Sala " + U.escapeHtml(it.sala) : "",
    ]
      .filter(Boolean)
      .join(" • ");

    const podeCancelar = it.status !== "cancelado" && it.status !== "aprovado";

    return `
      <div class="list-item">
        <span class="badge badge-${it.status}">${U.escapeHtml(it.status)}</span>
        <div class="grow">
          <div class="title">${U.formatDate(it.data)} — ${horarioTxt}</div>
          <div class="meta">${meta}</div>
          ${
            it.observacoes
              ? `<div class="meta" style="margin-top:.2rem;font-style:italic">"${U.escapeHtml(it.observacoes)}"</div>`
              : ""
          }
        </div>
        ${
          podeCancelar
            ? `<button class="btn btn-danger btn-sm" data-cancelar="${it.id}">Cancelar</button>`
            : ""
        }
      </div>
    `;
  }

  async function cancelar(btn) {
    if (!confirm("Cancelar este agendamento?")) return;

    btn.disabled = true;
    btn.textContent = "Cancelando...";

    const { error } = await db
      .from("agendamentos")
      .update({ status: "cancelado" })
      .eq("id", btn.dataset.cancelar);

    if (error) {
      btn.disabled = false;
      btn.textContent = "Cancelar";
      return U.toast("Erro: " + error.message, "error");
    }

    U.toast("Agendamento cancelado.", "info");
    await carregar();
  }

  /* ============================================================
     START
     ============================================================ */
  init();
})();
