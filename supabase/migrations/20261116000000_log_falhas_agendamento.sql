-- ============================================================================
-- ChromeAgenda — log das tentativas de agendamento que falharam
-- ----------------------------------------------------------------------------
-- Cria:
--   • public.tentativas_agendamento  (histórico de falhas por professor)
--   • public.registrar_falha_agendamento(...)  (RPC usada pelo painel)
--
-- Por que uma RPC? As validações do agendamento rodam em um trigger BEFORE
-- INSERT. Quando o trigger lança exceção (P0001..P0004), a transação inteira é
-- desfeita — inclusive qualquer INSERT de log feito dentro dela. Por isso o
-- front-end registra a falha em uma chamada separada, logo após receber o erro.
--
-- Idempotente: pode ser executado mais de uma vez no SQL Editor do Supabase.
-- ============================================================================

begin;

-- ============ 1. TABELA ============
create table if not exists public.tentativas_agendamento (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references auth.users(id) on delete cascade,
  professor_nome   text,
  professor_email  text,
  data_solicitada  date,
  horario_rotulo   text,
  turma_nome       text,
  quantidade       int,
  etapa            text not null default 'cliente',
  codigo           text,
  motivo           text not null,
  contexto         jsonb not null default '{}'::jsonb,
  user_agent       text,
  created_at       timestamptz not null default now()
);

comment on table public.tentativas_agendamento is
  'Tentativas de agendamento que retornaram erro. Visível apenas para administradores.';
comment on column public.tentativas_agendamento.etapa is
  'formulario | cliente | servidor | rede';
comment on column public.tentativas_agendamento.codigo is
  'Código do erro (P0001..P0004, códigos locais ou código retornado pelo Postgres).';

-- ============ 2. ÍNDICES ============
create index if not exists ix_tentativas_usuario_data
  on public.tentativas_agendamento (usuario_id, created_at desc);

create index if not exists ix_tentativas_created_at
  on public.tentativas_agendamento (created_at desc);

-- ============ 3. RPC DE REGISTRO ============
-- SECURITY DEFINER: o professor autenticado grava a falha sem precisar de
-- policy de INSERT na tabela. O dono da função (postgres) ignora o RLS.
-- O vínculo com o usuário vem de auth.uid(), nunca de um parâmetro enviado
-- pelo navegador — assim ninguém registra falha no nome de outra pessoa.
create or replace function public.registrar_falha_agendamento(
  p_motivo          text,
  p_codigo          text default null,
  p_etapa           text default 'cliente',
  p_data            date default null,
  p_horario_rotulo  text default null,
  p_turma_nome      text default null,
  p_quantidade      int default null,
  p_contexto        jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_nome   text;
  v_email  text;
  v_etapa  text := left(coalesce(nullif(trim(p_etapa), ''), 'cliente'), 20);
  v_codigo text := left(nullif(trim(p_codigo), ''), 40);
begin
  -- Sem sessão não há como identificar o professor: nada a registrar.
  if v_uid is null then
    return;
  end if;

  select nome, email into v_nome, v_email
    from public.perfis
   where id = v_uid;

  if v_email is null then
    select email into v_email
      from auth.users
     where id = v_uid;
  end if;

  insert into public.tentativas_agendamento (
    usuario_id,
    professor_nome,
    professor_email,
    data_solicitada,
    horario_rotulo,
    turma_nome,
    quantidade,
    etapa,
    codigo,
    motivo,
    contexto,
    user_agent
  ) values (
    v_uid,
    left(v_nome, 200),
    left(v_email, 200),
    p_data,
    left(p_horario_rotulo, 120),
    left(p_turma_nome, 120),
    case when p_quantidade is null then null else greatest(0, least(p_quantidade, 9999)) end,
    v_etapa,
    v_codigo,
    left(coalesce(nullif(trim(p_motivo), ''), 'Falha sem descrição'), 500),
    coalesce(p_contexto, '{}'::jsonb),
    left(nullif(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', ''), 300)
  );
end;
$$;

comment on function public.registrar_falha_agendamento(text, text, text, date, text, text, int, jsonb) is
  'Grava uma tentativa de agendamento que falhou para o usuário autenticado.';

-- ============ 4. RLS ============
alter table public.tentativas_agendamento enable row level security;

drop policy if exists "tentativas_admin_ve_todas" on public.tentativas_agendamento;
create policy "tentativas_admin_ve_todas" on public.tentativas_agendamento
  for select to authenticated
  using (public.is_admin());

-- Escrita apenas pela RPC (security definer). Ninguém altera o histórico.
revoke all on public.tentativas_agendamento from anon, authenticated;
grant select on public.tentativas_agendamento to authenticated;

revoke all on function public.registrar_falha_agendamento(text, text, text, date, text, text, int, jsonb)
  from public;
revoke all on function public.registrar_falha_agendamento(text, text, text, date, text, text, int, jsonb)
  from anon;
grant execute on function public.registrar_falha_agendamento(text, text, text, date, text, text, int, jsonb)
  to authenticated;

-- PostgREST recarrega o cache e passa a enxergar a tabela e a RPC na hora.
notify pgrst, 'reload schema';

commit;
