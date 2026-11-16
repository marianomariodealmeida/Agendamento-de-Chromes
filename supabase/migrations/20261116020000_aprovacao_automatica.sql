-- ============================================================================
-- ChromeAgenda — aprovação automática com pedido de exceção
-- ----------------------------------------------------------------------------
-- Regra nova:
--   • INSERT com status = 'aprovado'  → agendamento automático.
--     Só passa se respeitar antecedência mínima, eventos e conflito de
--     carrinhos (as diretrizes do site continuam valendo).
--   • INSERT com status = 'pendente'  → pedido de aprovação ao admin.
--     É criado quando o horário conflita com agendamentos existentes ou
--     está dentro do bloqueio de antecedência. Eventos e capacidade do
--     carrinho continuam bloqueando.
--   • UPDATE para 'aprovado' (feito pelo admin no painel) → aprovação
--     manual, que é uma decisão explícita do admin (pode liberar exceção).
--
-- Idempotente: pode ser executado mais de uma vez no SQL Editor do Supabase.
-- ============================================================================

begin;

create or replace function public.valida_agendamento()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_capacidade int;
  v_evento text;
  v_inicio time;
  v_horas int;
  v_inserindo boolean := (tg_op = 'INSERT');
  v_checar boolean := false;
begin
  if new.status = 'cancelado' then
    return new;
  end if;

  -- Serializa pedidos simultâneos para o mesmo dia/horário.
  perform pg_advisory_xact_lock(
    hashtext(coalesce(new.data::text, '') || ':' || coalesce(new.horario_id::text, ''))
  );

  if v_inserindo then
    -- Evento especial na data (bloqueio rígido, sem pedido de aprovação)
    select titulo into v_evento
      from public.eventos_especiais
     where data_inicio <= new.data
       and data_fim    >= new.data
       and (carrinho_id is null or new.carrinho_id is null or carrinho_id = new.carrinho_id)
     limit 1;

    if v_evento is not null then
      raise exception 'Data bloqueada: %', v_evento using errcode = 'P0002';
    end if;

    -- Capacidade real do carrinho (limite físico, sempre vale)
    if new.carrinho_id is not null then
      select count(*) into v_capacidade
        from public.chromebooks
       where carrinho_id = new.carrinho_id and status = 'disponivel';

      if v_capacidade > 0 and new.quantidade > v_capacidade then
        raise exception 'O carrinho tem apenas % Chromebook(s) disponível(is).',
          v_capacidade using errcode = 'P0001';
      end if;
    end if;

    -- Antecedência mínima: só no agendamento automático.
    -- Pedido 'pendente' é justamente a solicitação de exceção ao admin.
    if new.status = 'aprovado' then
      select hora_inicio into v_inicio
        from public.horarios_aula where id = new.horario_id;

      if v_inicio is not null then
        select coalesce(bloqueio_horas, 0) into v_horas
          from public.configuracoes_site where id = 1;
        v_horas := coalesce(v_horas, 0);

        if ((new.data + v_inicio) at time zone 'America/Sao_Paulo')
             < (now() + make_interval(hours => v_horas)) then
          raise exception 'Antecedência mínima de %h.', v_horas using errcode = 'P0003';
        end if;
      end if;
    end if;
  end if;

  -- Conflito de carrinhos: barra o agendamento automático.
  -- A aprovação manual do admin é uma decisão explícita e não é revalidada.
  if v_inserindo then
    v_checar := (new.status = 'aprovado');
  else
    v_checar := false;
  end if;

  if v_checar then
    if public.conflito_carrinhos(new.data, new.horario_id, new.id) then
      raise exception 'Os carrinhos já estão em uso nesse horário.' using errcode = 'P0004';
    end if;
  end if;

  return new;
end $$;

-- Aprovação automática não tem aprovador humano.
create or replace function public.registra_aprovacao()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    if public.is_admin() then
      new.aprovado_por = auth.uid();
    else
      new.aprovado_por = null;
    end if;
    new.aprovado_em = now();
  elsif new.status <> 'aprovado' then
    new.aprovado_por = null;
    new.aprovado_em = null;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';

commit;
