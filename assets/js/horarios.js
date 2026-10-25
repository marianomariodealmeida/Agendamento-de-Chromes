(function () {
  const { db } = window;

async function listarPorSegmento(segmento, turno = null, diaSemana = "padrao") {
  let q = db
    .from("horarios_aula")
    .select("*")
    .eq("segmento", segmento)
    .eq("dia_semana", diaSemana)
    .order("ordem");

  if (turno) q = q.eq("turno", turno);

  const { data } = await q;
  return data || [];
}

  async function listarTurmas() {
    const { data } = await db.from("turmas").select("*").order("nome");
    return data || [];
  }

  async function turmaPorId(id) {
    const { data } = await db.from("turmas").select("*").eq("id", id).maybeSingle();
    return data || null;
  }

  async function eventosDoDia(iso, carrinhoId = null) {
    let q = db
      .from("eventos_especiais")
      .select("*")
      .lte("data_inicio", iso)
      .gte("data_fim", iso);

    const { data } = await q;
    return (data || []).filter(
      (e) => !e.carrinho_id || !carrinhoId || e.carrinho_id === carrinhoId
    );
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
