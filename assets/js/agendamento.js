/* ============================================================
   agendamento.js — Painel do professor
   Regras aplicadas:
     • Turma → horários do segmento (manhã/tarde, regular/sexta)
     • Bloqueio antecipado (bloqueio_horas)
     • Eventos especiais (datas bloqueadas)
     • Conflito de carrinhos por sobreposição de intervalos
       (bloqueia se 2+ carrinhos ficariam ocupados em qualquer
        instante da janela solicitada — verificar_conflito_carrinhos)
   ============================================================ */
(function () {
  const { db } = window;
  const U = window.U;

  const form    = document.getElementById("form-agendamento");
  const listEl  = document.getElementById("meus-agendamentos");
  const avisoEl = document.getElementById("aviso-bloqueio");

  if (!form && !listEl) return;

  const selTurma   = document.getElementById("turma");
  const selHorario = document.getElementById("horario");

  let session = null;
  let perfil  = null;
  let turmas  = [];

  const SEGMENTO_LABEL = {
    infantil:   "Educação Infantil",
    fund1:      "Fundamental 1",
    fund2:      "Fundamental 2",
    medio:      "Ensino Médio",
    contraturno:"Contraturno",
  };

  /* ============================================================ INIT */
  async function init() {
    session = await Auth.requireAuth("login.html");
    if (!session) return;

    perfil = await Auth.getPerfil(session.user.id);
    turmas = await Horarios.listarTurmas();
    preencherTurmas();

    if (form) {
      const params = new URLSearchParams(window.location.search);
      const dataParam = params.get("data");
      form.data.value = dataParam || U.toISODate(new Date());

      // Recarrega horários quando a data muda (sexta-feira afeta o turno da tarde)
      form.data.addEventListener("change", () => {
        if (selTurma?.value) aoTrocarTurma();
      });
    }

    selTurma?.addEventListener("change", aoTrocarTurma);
    form?.addEventListener("submit", criar);

    await carregar();
  }

  /* ============================================================ TURMAS */
  function preencherTurmas() {
    if (!selTurma) return;
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

  async function aoTrocarTurma() {
    if (!selHorario) return;

    const opt = selTurma.options[selTurma.selectedIndex];
    const segmento = opt?.dataset.segmento;
    const turno    = opt?.dataset.turno;

    if (!segmento) {
      selHorario.innerHTML = `<option value="">Selecione a turma primeiro...</option>`;
      selHorario.disabled = true;
      return;
    }

    selHorario.disabled = true;
    selHorario.innerHTML = `<option value="">Carregando horários...</option>`;

    // Descobre se a data escolhida cai numa sexta-feira (turno da tarde → horários "sexta")
    const dataStr = form?.data?.value;
    const isSexta = dataStr
      ? new Date(dataStr + "T00:00:00").getDay() === 5
      : false;
    const diaSemana = (turno === "tarde" && isSexta) ? "sexta" : "padrao";

    const horarios = await Horarios.listarPorSegmento(segmento, turno, diaSemana);

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

  /* ============================================================ CRIAÇÃO */
  async function criar(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');

    /* -------- Coleta -------- */
    const dataStr     = form.data.value;
    const turmaId     = selTurma?.value || null;
    const horarioId   = selHorario?.value || null;
    const quantidade  = Number(form.quantidade.value) || 1;
    const sala        = form.sala.value.trim() || null;
    const observacoes = form.observacoes.value.trim() || null;

    /* -------- Validações básicas -------- */
    if (!dataStr)   return U.toast("Escolha uma data.", "error");
    if (!turmaId)   return U.toast("Selecione a turma.", "error");
    if (!horarioId) return U.toast("Selecione o horário de aula.", "error");
    if (quantidade < 1 || quantidade > 40)
      return U.toast("Quantidade deve ser entre 1 e 40.", "error");

    /* -------- Bloqueio antecipado -------- */
    const horasBloq  = await Horarios.bloqueioHoras();
    const horarioOpt = selHorario.options[selHorario.selectedIndex];
    const horaInicio = horarioOpt?.dataset.inicio || "00:00";
    const dataHoraAgendada = new Date(`${dataStr}T${horaInicio}:00`);
    const agora = new Date();
    const diffHoras = (dataHoraAgendada - agora) / 36e5;

    if (diffHoras < horasBloq) {
      const msg =
        `Antecedência mínima de ${horasBloq}h. ` +
        `Escolha um horário a partir de ` +
        new Date(agora.getTime() + horasBloq * 36e5).toLocaleString("pt-BR");
      if (avisoEl) { avisoEl.style.display = "block"; avisoEl.textContent = "⚠️ " + msg; }
      return U.toast(msg, "error", 5500);
    } else if (avisoEl) {
      avisoEl.style.display = "none";
    }

    /* -------- Eventos especiais -------- */
    const eventos = await Horarios.eventosDoDia(dataStr, null);
    if (eventos.length) {
      const ev = eventos[0];
      const msg = `Data bloqueada: ${ev.titulo} (${U.formatDate(ev.data_inicio)} → ${U.formatDate(ev.data_fim)})`;
      if (avisoEl) { avisoEl.style.display = "block"; avisoEl.textContent = "🚫 " + msg; }
      return U.toast(msg, "error", 5500);
    } else if (avisoEl) {
      avisoEl.style.display = "none";
    }

    /* -------- Conflito de carrinhos (sobreposição real) -------- */
    const { data: conflito, error: conflitoErr } = await db.rpc(
      "verificar_conflito_carrinhos",
      { p_data: dataStr, p_horario_id: horarioId }
    );

    if (conflitoErr) {
      console.warn("[agendamento] rpc conflito:", conflitoErr.message);
    } else if (conflito) {
      return U.toast(
        "Não é possível agendar: em algum momento desse horário os dois carrinhos já estão em uso.",
        "error",
        6500
      );
    }

    /* -------- Monta payload -------- */
    const payload = {
      usuario_id: session.user.id,
      professor_nome: perfil?.nome || session.user.email,
      data: dataStr,
      periodo: "aula",
      quantidade,
      sala,
      observacoes,
      turma_id: turmaId,
      horario_id: horarioId,
      status: "pendente",
    };

    /* -------- Insert -------- */
    btn.disabled = true;
    btn.textContent = "Enviando...";

    const { error } = await db.from("agendamentos").insert(payload);

    btn.disabled = false;
    btn.textContent = "Solicitar agendamento";

    if (error) {
      switch (error.code) {
        case "P0001":
          return U.toast("Este horário já está cheio. Escolha outro.", "error", 5500);
        case "P0002":
          return U.toast(error.message, "error", 6500);   // evento especial
        case "P0003":
          return U.toast(error.message, "error", 6500);   // antecedência mínima
        case "P0004":
          return U.toast(error.message, "error", 6500);   // 2 carrinhos em uso
        default:
          return U.toast("Erro: " + error.message, "error", 6000);
      }
    }

    /* -------- Sucesso -------- */
    U.toast("Agendamento solicitado!", "success");
    form.reset();
    form.data.value = U.toISODate(new Date());
    if (selHorario) {
      selHorario.innerHTML = `<option value="">Selecione a turma primeiro...</option>`;
      selHorario.disabled = true;
    }
    if (avisoEl) avisoEl.style.display = "none";

    await carregar();
  }

  /* ============================================================ LISTAGEM */
  async function carregar() {
    if (!listEl) return;

    const { data, error } = await db
      .from("agendamentos")
      .select(
        "*, turma:turmas(nome,segmento), horario:horarios_aula(rotulo,hora_inicio,hora_fim)"
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
    listEl.querySelectorAll("[data-cancelar]").forEach((btn) =>
      btn.addEventListener("click", () => cancelar(btn))
    );
  }

  function renderItem(it) {
    const horarioTxt = it.horario
      ? `${U.escapeHtml(it.horario.rotulo)} (${it.horario.hora_inicio}–${it.horario.hora_fim})`
      : U.escapeHtml(U.periodoLabel(it.periodo));

    const turmaTxt = it.turma?.nome
      ? `Turma ${U.escapeHtml(it.turma.nome)}`
      : "";

    const meta = [
      `${it.quantidade} Chromebook(s)`,
      turmaTxt,
      it.sala ? "Sala " + U.escapeHtml(it.sala) : "",
    ].filter(Boolean).join(" • ");

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

  /* ============================================================ START */
  init();
})();
