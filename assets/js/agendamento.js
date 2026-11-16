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

  const STATUS_LABEL = {
    pendente:  "Pendente",
    aprovado:  "Confirmado",
    cancelado: "Cancelado",
  };

  /* ============================================================ LOG DE FALHAS */
  function nomeTurmaSelecionada() {
    const opt = selTurma?.options?.[selTurma.selectedIndex];
    return opt && opt.value ? opt.textContent.trim() : null;
  }

  function rotuloHorarioSelecionado() {
    const opt = selHorario?.options?.[selHorario.selectedIndex];
    return opt && opt.value ? opt.textContent.trim() : null;
  }

  /**
   * Envia a tentativa que falhou para a tabela de log (visível ao admin).
   * Nunca interrompe o fluxo do professor: se o log falhar, apenas avisa
   * no console. Não usamos await nos pontos de erro para não atrasar o toast.
   */
  async function registrarFalha(etapa, codigo, motivo, dados = {}) {
    try {
      const { error } = await db.rpc("registrar_falha_agendamento", {
        p_motivo: motivo,
        p_codigo: codigo || null,
        p_etapa: etapa,
        p_data: dados.data || null,
        p_horario_rotulo: dados.horario || null,
        p_turma_nome: dados.turma || null,
        p_quantidade: Number.isFinite(dados.quantidade) ? dados.quantidade : null,
        p_contexto: dados.contexto || {},
      });
      if (error) console.warn("[agendamento] log de falha:", error.message);
    } catch (err) {
      console.warn("[agendamento] log de falha:", err?.message || err);
    }
  }

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

      // Não permite data no passado nem agendamento absurdamente distante.
      const hoje = new Date();
      const limite = new Date();
      limite.setDate(limite.getDate() + 180);
      form.data.min = U.toISODate(hoje);
      form.data.max = U.toISODate(limite);

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
            `<option value="${h.id}" data-inicio="${h.hora_inicio}" data-fim="${h.hora_fim}" data-turno="${U.escapeHtml(h.turno || turno || "")}">` +
            `${U.escapeHtml(h.rotulo)} (${h.hora_inicio} – ${h.hora_fim})` +
            `</option>`
        )
        .join("");
    selHorario.disabled = false;
  }

  /* ============================================================ MODAL DE DECISÃO */
  const modalDecisao = {
    root:           document.getElementById("modal-decisao"),
    titulo:         document.getElementById("modal-decisao-titulo"),
    texto:          document.getElementById("modal-decisao-texto"),
    fechar:         document.getElementById("modal-decisao-close"),
    outroHorario:   document.getElementById("modal-decisao-outro"),
    pedirAprovacao: document.getElementById("modal-decisao-aprovar"),
  };

  let acaoAprovacao = null;
  let focoAnterior  = null;

  function abrirDecisao({ titulo, mensagem, onAprovar }) {
    // Página com HTML antigo em cache: cai no confirm nativo.
    if (!modalDecisao.root) {
      const ok = confirm(
        `${titulo}\n\n${mensagem.replace(/<[^>]+>/g, " ")}\n\n` +
          `OK = pedir aprovação ao admin\nCancelar = escolher outro horário`
      );
      if (ok) return onAprovar();
      return limparFormulario();
    }

    acaoAprovacao = onAprovar;
    focoAnterior  = document.activeElement;

    modalDecisao.titulo.textContent = titulo;
    modalDecisao.texto.innerHTML = mensagem;
    modalDecisao.pedirAprovacao.disabled = false;
    modalDecisao.outroHorario.disabled = false;
    modalDecisao.root.hidden = false;
    modalDecisao.pedirAprovacao.focus();
  }

  function fecharDecisao({ devolverFoco = true } = {}) {
    if (!modalDecisao.root) return;
    modalDecisao.root.hidden = true;
    acaoAprovacao = null;
    if (devolverFoco && focoAnterior?.focus) focoAnterior.focus();
  }

  if (modalDecisao.root) {
    modalDecisao.fechar?.addEventListener("click", () => fecharDecisao());
    modalDecisao.outroHorario?.addEventListener("click", () => {
      fecharDecisao({ devolverFoco: false });
      limparFormulario();
    });
    modalDecisao.pedirAprovacao?.addEventListener("click", async () => {
      const acao = acaoAprovacao;
      fecharDecisao();
      if (acao) await acao();
    });
    modalDecisao.root.addEventListener("click", (ev) => {
      if (ev.target === modalDecisao.root) fecharDecisao();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !modalDecisao.root.hidden) fecharDecisao();
    });
  }

  /** Limpa o formulário para o usuário escolher outro horário. */
  function limparFormulario() {
    if (!form) return;
    form.reset();
    form.data.value = U.toISODate(new Date());
    if (selTurma) selTurma.value = "";
    if (selHorario) {
      selHorario.innerHTML = `<option value="">Selecione a turma primeiro...</option>`;
      selHorario.disabled = true;
    }
    if (avisoEl) {
      avisoEl.style.display = "none";
      avisoEl.textContent = "";
    }
    form.data.focus?.();
  }

  /* ============================================================ CRIAÇÃO */
  const BTN_TEXTO      = "Confirmar agendamento";
  const STATUS_AUTO    = "aprovado";
  const STATUS_PENDENTE = "pendente";

  async function criar(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');

    /* -------- Coleta -------- */
    const dataStr     = form.data.value;
    const turmaId     = selTurma?.value || null;
    const horarioId   = selHorario?.value || null;
    // O formulário não pede mais a quantidade: o valor fica neutro (1) para
    // manter compatibilidade com a coluna `agendamentos.quantidade`.
    const quantidade  = Number(form.quantidade?.value) || 1;
    const sala        = form.sala.value.trim() || null;
    const observacoes = form.observacoes.value.trim() || null;

    const turmaNome     = nomeTurmaSelecionada();
    const horarioRotulo = rotuloHorarioSelecionado();

    /** Dispara o log da falha com o contexto do formulário. */
    const falha = (etapa, codigo, motivo, extra = {}) => {
      void registrarFalha(etapa, codigo, motivo, {
        data: dataStr || null,
        turma: turmaNome,
        horario: horarioRotulo,
        quantidade,
        contexto: {
          turma_id: turmaId,
          horario_id: horarioId,
          sala,
          observacoes,
          ...extra,
        },
      });
    };

    /* -------- Validações básicas -------- */
    if (!dataStr) {
      falha("formulario", "CAMPO_OBRIGATORIO", "Escolha uma data para o agendamento.");
      return U.toast("Escolha uma data.", "error");
    }
    if (!turmaId) {
      falha("formulario", "CAMPO_OBRIGATORIO", "Nenhuma turma foi selecionada.");
      return U.toast("Selecione a turma.", "error");
    }
    if (!horarioId) {
      falha("formulario", "CAMPO_OBRIGATORIO", "Nenhum horário de aula foi selecionado.");
      return U.toast("Selecione o horário de aula.", "error");
    }
    if (quantidade < 1 || quantidade > 40) {
      falha("formulario", "QUANTIDADE_INVALIDA", "Quantidade de Chromebooks fora do limite (1 a 40).");
      return U.toast("Quantidade deve ser entre 1 e 40.", "error");
    }

    /* -------- Envio (auto-aprovado ou pedido de aprovação) -------- */
    async function enviar(payload, { pendente }) {
      btn.disabled = true;
      btn.textContent = pendente ? "Enviando pedido..." : "Agendando...";

      const { error } = await db.from("agendamentos").insert(payload);

      btn.disabled = false;
      btn.textContent = BTN_TEXTO;

      if (error) {
        // Corrida: o banco recusou a confirmação automática. Oferece aprovação.
        if (!pendente && (error.code === "P0003" || error.code === "P0004")) {
          falha("servidor", error.code, error.message, { sugestao: "pedir_aprovacao" });
          return abrirDecisao({
            titulo: error.code === "P0004" ? "Horário em conflito" : "Fora do prazo mínimo",
            mensagem:
              `<p>${U.escapeHtml(error.message)}</p>` +
              `<p>O que você prefere fazer?</p>`,
            onAprovar: () => enviar(novoAgendamento(STATUS_PENDENTE), { pendente: true }),
          });
        }

        let msg;
        let ms = 6500;
        switch (error.code) {
          case "P0001":
            msg = "Este horário já está cheio. Escolha outro.";
            ms = 5500;
            break;
          case "P0002":
            msg = error.message;   // evento especial
            break;
          case "P0003":
            msg = error.message;   // antecedência mínima
            break;
          case "P0004":
            msg = error.message;   // 2 carrinhos em uso
            break;
          default:
            msg = "Erro: " + error.message;
            ms = 6000;
        }

        if (pendente && (error.code === "P0003" || error.code === "P0004")) {
          // Acontece enquanto a atualização do banco não for aplicada.
          msg = "O pedido de aprovação ainda não está habilitado no servidor. Avise o administrador.";
        }

        falha("servidor", error.code || "ERRO_SERVIDOR", error.message || msg, {
          detalhes: error.details || null,
          hint: error.hint || null,
          mensagem_exibida: msg,
          pedido_aprovacao: pendente,
        });

        return U.toast(
          pendente ? `Não foi possível pedir aprovação: ${msg}` : msg,
          "error",
          ms
        );
      }

      if (pendente) {
        /* -------- Pedido de aprovação enviado -------- */
        U.toast("Pedido enviado! Aguardando aprovação do admin.", "success", 5000);
        limparFormulario();
      } else {
        /* -------- Agendamento confirmado automaticamente -------- */
        U.toast("Agendamento confirmado!", "success");
        form.reset();
        // Mantém a data e a turma para facilitar agendar vários horários no mesmo dia.
        form.data.value = dataStr;
        if (selTurma && turmaId) {
          selTurma.value = turmaId;
          await aoTrocarTurma();
        } else if (selHorario) {
          selHorario.innerHTML = `<option value="">Selecione a turma primeiro...</option>`;
          selHorario.disabled = true;
        }
        if (avisoEl) avisoEl.style.display = "none";
      }

      await carregar();
    }

    /* -------- Eventos especiais (bloqueio rígido) -------- */
    const eventos = await Horarios.eventosDoDia(dataStr, null);
    if (eventos.length) {
      const ev = eventos[0];
      const msg = `Data bloqueada: ${ev.titulo} (${U.formatDate(ev.data_inicio)} → ${U.formatDate(ev.data_fim)})`;
      falha("cliente", "P0002", msg, {
        evento_id: ev.id,
        evento_titulo: ev.titulo,
      });
      if (avisoEl) { avisoEl.style.display = "block"; avisoEl.textContent = "🚫 " + msg; }
      return U.toast(msg, "error", 5500);
    } else if (avisoEl) {
      avisoEl.style.display = "none";
    }

    /* -------- Antecedência e conflito → pedir aprovação ou trocar horário -------- */
    const horasBloq  = await Horarios.bloqueioHoras();
    const horarioOpt = selHorario.options[selHorario.selectedIndex];
    const horaInicio = horarioOpt?.dataset.inicio || "00:00";
    const dataHoraAgendada = new Date(`${dataStr}T${horaInicio}:00`);
    const agora = new Date();
    const diffHoras = (dataHoraAgendada - agora) / 36e5;
    const faltaAntecedencia = diffHoras < horasBloq;

    const { data: conflito, error: conflitoErr } = await db.rpc(
      "verificar_conflito_carrinhos",
      { p_data: dataStr, p_horario_id: horarioId }
    );
    if (conflitoErr) console.warn("[agendamento] rpc conflito:", conflitoErr.message);

    const turnoHorario = horarioOpt?.dataset.turno || "";

    /** Payload do agendamento, com o status decidido pelo usuário. */
    function novoAgendamento(status) {
      return {
        usuario_id: session.user.id,
        professor_nome: perfil?.nome || session.user.email,
        data: dataStr,
        periodo: turnoHorario || "aula",
        quantidade,
        sala,
        observacoes,
        turma_id: turmaId,
        horario_id: horarioId,
        status,
      };
    }

    if (faltaAntecedencia || conflito) {
      const motivosHtml = [];

      if (conflito) {
        motivosHtml.push(
          "<strong>Já existem agendamentos neste horário</strong> ocupando os dois carrinhos de Chromebooks."
        );
      }
      if (faltaAntecedencia) {
        const limite = new Date(agora.getTime() + horasBloq * 36e5);
        motivosHtml.push(
          `O pedido está dentro do bloqueio de antecedência: são necessárias pelo menos ` +
            `<strong>${horasBloq}h</strong> (a partir de ` +
            U.escapeHtml(limite.toLocaleString("pt-BR")) + ")."
        );
      }

      falha(
        "cliente",
        conflito ? "P0004" : "BLOQUEIO_ANTECEDENCIA",
        motivosHtml.join(" ").replace(/<[^>]+>/g, ""),
        {
          horas_bloqueio: horasBloq,
          horas_de_antecedencia: Math.round(diffHoras * 100) / 100,
          conflito: Boolean(conflito),
          sugestao: "pedir_aprovacao",
        }
      );

      if (avisoEl) {
        avisoEl.style.display = "block";
        avisoEl.textContent =
          "⚠️ Horário indisponível para confirmação automática. Escolha outro horário ou peça aprovação.";
      }

      return abrirDecisao({
        titulo: conflito ? "Horário em conflito" : "Fora do prazo mínimo",
        mensagem:
          `<p>${motivosHtml.join("</p><p>")}</p>` +
          `<p>O que você prefere fazer?</p>`,
        onAprovar: () => enviar(novoAgendamento(STATUS_PENDENTE), { pendente: true }),
      });
    }

    return enviar(novoAgendamento(STATUS_AUTO), { pendente: false });
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
      turmaTxt,
      it.sala ? "Sala " + U.escapeHtml(it.sala) : "",
    ].filter(Boolean).join(" • ");

    const podeCancelar = it.status !== "cancelado";
    const statusLabel = STATUS_LABEL[it.status] || it.status;

    return `
      <div class="list-item">
        <span class="badge badge-${U.escapeHtml(it.status)}">${U.escapeHtml(statusLabel)}</span>
        <div class="grow">
          <div class="title">${U.formatDate(it.data)} — ${horarioTxt}</div>
          <div class="meta">${meta}</div>
          ${
            it.status === "pendente"
              ? `<div class="meta" style="margin-top:.2rem">⏳ Aguardando aprovação do administrador.</div>`
              : ""
          }
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
    if (!confirm("Cancelar este agendamento? A solicitação sai do calendário.")) return;

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
