(function () {
  const { db } = window;

  /**
   * Lista os horários de aula de um segmento.
   * Degrada com elegância se o banco ainda não tiver as colunas
   * `turno` / `dia_semana` (schema antigo).
   */
  async function listarPorSegmento(segmento, turno = null, diaSemana = "padrao") {
    const base = () =>
      db.from("horarios_aula").select("*").eq("segmento", segmento).order("ordem");

    let q = base().eq("dia_semana", diaSemana);
    if (turno) q = q.eq("turno", turno);
    let { data, error } = await q;

    if (error) {
      let q2 = base();
      if (turno) q2 = q2.eq("turno", turno);
      ({ data, error } = await q2);
      if (error) {
        ({ data, error } = await base());
        if (error) {
          console.warn("[horarios]", error.message);
          return [];
        }
      }
    }
    return data || [];
  }

  async function listarTurmas() {
    const { data, error } = await db.from("turmas").select("*").order("nome");
    if (error) {
      console.warn("[turmas]", error.message);
      return [];
    }
    return data || [];
  }

  async function turmaPorId(id) {
    const { data } = await db.from("turmas").select("*").eq("id", id).maybeSingle();
    return data || null;
  }

  async function eventosDoDia(iso, carrinhoId = null) {
    const { data } = await db
      .from("eventos_especiais")
      .select("id,titulo,data_inicio,data_fim,carrinho_id")
      .lte("data_inicio", iso)
      .gte("data_fim", iso);

    return (data || []).filter((e) => {
      // Evento sem carrinho bloqueia todo mundo.
      if (!e.carrinho_id) return true;
      // Sem carrinho definido no pedido: bloqueia por segurança.
      if (!carrinhoId) return true;
      return e.carrinho_id === carrinhoId;
    });
  }

  async function bloqueioHoras() {
    const { data } = await db
      .from("configuracoes_site")
      .select("bloqueio_horas")
      .eq("id", 1)
      .maybeSingle();
    return Number(data?.bloqueio_horas ?? 24);
  }

  window.Horarios = {
    listarPorSegmento,
    listarTurmas,
    turmaPorId,
    eventosDoDia,
    bloqueioHoras,
  };
})();
