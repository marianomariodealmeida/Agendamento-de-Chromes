-- ============================================================================
-- ChromeAgenda — schema completo e idempotente
-- ----------------------------------------------------------------------------
-- Pode ser executado quantas vezes for preciso no SQL Editor do Supabase.
-- Ele:
--   1. cria o que falta (tabelas/colunas);
--   2. corrige as policies de RLS (fecha escalada de privilégio);
--   3. cria a view pública sem dados pessoais;
--   4. instala as travas de integridade (conflito, capacidade, auditoria);
--   5. cria o bucket de banners e suas policies.
--
-- IMPORTANTE: rode primeiro `00_diagnostico.sql` para registrar o estado atual.
-- Para deploy sem derrubar o site antigo, aplique `01_transicao_view.sql`
-- antes de mesclar o front-end novo.
-- ============================================================================

begin;

-- ============ 1. TABELAS ============
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  cargo text not null default 'professor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.carrinhos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  localizacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chromebooks (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero_serie text,
  numero_atribuido text,
  polegadas numeric(4,1),
  carrinho_id uuid references public.carrinhos(id) on delete set null,
  status text not null default 'disponivel',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  segmento text not null default 'fund2',
  turno text not null default 'manha',
  created_at timestamptz not null default now()
);

create table if not exists public.horarios_aula (
  id uuid primary key default gen_random_uuid(),
  segmento text not null,
  turno text not null default 'manha',
  dia_semana text not null default 'padrao',
  rotulo text not null,
  hora_inicio time not null,
  hora_fim time not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.eventos_especiais (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  data_inicio date not null,
  data_fim date not null,
  dia_inteiro boolean not null default true,
  carrinho_id uuid references public.carrinhos(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete cascade,
  professor_nome text,
  data date not null,
  periodo text not null default 'aula',
  quantidade int not null default 1,
  sala text,
  observacoes text,
  status text not null default 'pendente',
  turma_id uuid references public.turmas(id) on delete set null,
  horario_id uuid references public.horarios_aula(id) on delete set null,
  carrinho_id uuid references public.carrinhos(id) on delete set null,
  aprovado_por uuid references auth.users(id) on delete set null,
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.configuracoes_site (
  id int primary key default 1,
  nome_site text default 'ChromeAgenda',
  titulo_home text,
  subtitulo_home text,
  texto_botao_primario text,
  texto_botao_secundario text,
  cor_primaria text default '#2563eb',
  cor_secundaria text default '#06b6d4',
  bloqueio_horas int not null default 24,
  updated_at timestamptz not null default now()
);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  titulo text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

-- ============ 2. COLUNAS QUE PODEM FALTAR EM BANCOS ANTIGOS ============
alter table public.agendamentos add column if not exists turma_id uuid;
alter table public.agendamentos add column if not exists horario_id uuid;
alter table public.agendamentos add column if not exists carrinho_id uuid;
alter table public.agendamentos add column if not exists aprovado_por uuid;
alter table public.agendamentos add column if not exists aprovado_em timestamptz;
alter table public.agendamentos add column if not exists updated_at timestamptz default now();

alter table public.horarios_aula add column if not exists turno text default 'manha';
alter table public.horarios_aula add column if not exists dia_semana text default 'padrao';
alter table public.horarios_aula add column if not exists ordem int default 0;

alter table public.chromebooks add column if not exists carrinho_id uuid;
alter table public.chromebooks add column if not exists status text default 'disponivel';
alter table public.chromebooks add column if not exists updated_at timestamptz default now();

alter table public.carrinhos add column if not exists ativo boolean default true;
alter table public.carrinhos add column if not exists updated_at timestamptz default now();

alter table public.perfis add column if not exists updated_at timestamptz default now();

alter table public.eventos_especiais add column if not exists dia_inteiro boolean default true;

alter table public.configuracoes_site add column if not exists bloqueio_horas int default 24;
alter table public.configuracoes_site add column if not exists updated_at timestamptz default now();

-- Normaliza nulos que quebrariam a interface
update public.horarios_aula set turno = 'manha' where turno is null;
update public.horarios_aula set dia_semana = 'padrao' where dia_semana is null;
update public.agendamentos set updated_at = now() where updated_at is null;
update public.configuracoes_site set bloqueio_horas = 24 where bloqueio_horas is null;

-- ============ 3. CONSTRAINTS ============
-- periodo: aceita os turnos e o valor legado 'aula' gravado pelo painel
do $$
declare r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.agendamentos'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%periodo%'
  loop
    execute format('alter table public.agendamentos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.agendamentos
  add constraint agendamentos_periodo_check
  check (periodo in ('manha', 'tarde', 'noite', 'aula'));

alter table public.agendamentos drop constraint if exists agendamentos_status_check;
alter table public.agendamentos
  add constraint agendamentos_status_check
  check (status in ('pendente', 'aprovado', 'cancelado'));

alter table public.agendamentos drop constraint if exists agendamentos_quantidade_check;
alter table public.agendamentos
  add constraint agendamentos_quantidade_check
  check (quantidade between 1 and 40);

alter table public.perfis drop constraint if exists perfis_cargo_check;
alter table public.perfis
  add constraint perfis_cargo_check
  check (cargo in ('professor', 'admin'));

-- O painel agora cadastra turmas/horários do turno da noite.
alter table public.horarios_aula drop constraint if exists horarios_aula_turno_check;
alter table public.horarios_aula
  add constraint horarios_aula_turno_check
  check (turno in ('manha', 'tarde', 'noite'));

alter table public.turmas drop constraint if exists turmas_turno_check;
alter table public.turmas
  add constraint turmas_turno_check
  check (turno in ('manha', 'tarde', 'noite'));

-- ============ 4. FUNÇÕES ============
-- Remove as travas antigas (duas implementações de conflito) antes de
-- redefinir as funções, para não deixar dependências penduradas.
drop trigger if exists trg_limitar_agendamentos on public.agendamentos;
drop trigger if exists trg_limitar_agendamentos_update on public.agendamentos;
drop function if exists public.limitar_agendamentos_por_horario();
drop function if exists public.limitar_agendamentos_update();
drop function if exists public.verificar_conflito_carrinhos(date, uuid, uuid);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis where id = auth.uid() and cargo = 'admin'
  );
$$;

-- Impede que um professor altere o próprio cargo (a falha mais grave do projeto)
create or replace function public.protege_cargo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.cargo is distinct from old.cargo and not public.is_admin() then
    raise exception 'Apenas administradores podem alterar o cargo.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Um professor só pode cancelar o próprio pedido; o resto é imutável.
create or replace function public.protege_agendamento()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.usuario_id  is distinct from old.usuario_id
     or new.data        is distinct from old.data
     or new.horario_id  is distinct from old.horario_id
     or new.turma_id    is distinct from old.turma_id
     or new.quantidade  is distinct from old.quantidade
     or new.carrinho_id is distinct from old.carrinho_id
     or new.professor_nome is distinct from old.professor_nome then
    raise exception 'Você só pode cancelar sua solicitação.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (new.status = 'cancelado' and old.status in ('pendente', 'aprovado')) then
    raise exception 'Transição de status não permitida.' using errcode = '42501';
  end if;

  return new;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.registra_aprovacao()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    new.aprovado_por = auth.uid();
    new.aprovado_em = now();
  elsif new.status <> 'aprovado' then
    new.aprovado_por = null;
    new.aprovado_em = null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- conflitos
-- Conta quantos carrinhos estão ocupados na janela de horário pedida,
-- considerando sobreposição real (aula de 50min x aula de 100min).
-- Retorna true quando não há carrinho livre.
create or replace function public.conflito_carrinhos(
  p_data date,
  p_horario_id uuid,
  p_ignorar_id uuid default null
)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_inicio time;
  v_fim time;
  v_total int;
  v_conflito boolean := false;
begin
  if p_horario_id is null then
    return false;
  end if;

  select hora_inicio, hora_fim
    into v_inicio, v_fim
    from public.horarios_aula
   where id = p_horario_id;

  if v_inicio is null then
    return false;
  end if;

  select count(*) into v_total from public.carrinhos;
  if v_total = 0 then
    v_total := 2; -- padrão enquanto o admin não cadastra os carrinhos
  end if;

  with concorrentes as (
    select h.hora_inicio, h.hora_fim
      from public.agendamentos a
      join public.horarios_aula h on h.id = a.horario_id
     where a.data = p_data
       and a.status in ('pendente', 'aprovado')
       and (p_ignorar_id is null or a.id <> p_ignorar_id)
       and h.hora_inicio < v_fim
       and h.hora_fim    > v_inicio
  ),
  eventos as (
    select greatest(hora_inicio, v_inicio) as t, +1 as delta from concorrentes
    union all
    select least(hora_fim,    v_fim)    as t, -1 as delta from concorrentes
  ),
  momentos as (
    select t, sum(delta) over (order by t, delta asc) as ativos from eventos
  )
  select exists (select 1 from momentos where ativos >= v_total) into v_conflito;

  return coalesce(v_conflito, false);
end $$;

-- Mantida para o cliente (checagem prévia); a versão autoritativa é o trigger.
-- Assinatura de 2 argumentos para o RPC do front-end.
create or replace function public.verificar_conflito_carrinhos(p_data date, p_horario_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.conflito_carrinhos(p_data, p_horario_id, null);
$$;

-- Trava atômica: conflito de carrinhos, capacidade e eventos.
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
    -- Evento especial na data
    select titulo into v_evento
      from public.eventos_especiais
     where data_inicio <= new.data
       and data_fim    >= new.data
       and (carrinho_id is null or new.carrinho_id is null or carrinho_id = new.carrinho_id)
     limit 1;

    if v_evento is not null then
      raise exception 'Data bloqueada: %', v_evento using errcode = 'P0002';
    end if;

    -- Antecedência mínima
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

    -- Capacidade real do carrinho
    if new.carrinho_id is not null then
      select count(*) into v_capacidade
        from public.chromebooks
       where carrinho_id = new.carrinho_id and status = 'disponivel';

      if v_capacidade > 0 and new.quantidade > v_capacidade then
        raise exception 'O carrinho tem apenas % Chromebook(s) disponível(is).',
          v_capacidade using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Conflito de carrinhos (também na aprovação)
  if v_inserindo then
    v_checar := true;
  elsif new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    v_checar := true;
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

-- Cria o perfil automaticamente no cadastro
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, cargo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'professor'
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ============ 5. TRIGGERS ============
-- Nomes antigos de updated_at
drop trigger if exists trg_agendamentos_updated_at on public.agendamentos;
drop trigger if exists trg_perfis_updated_at on public.perfis;
drop trigger if exists trg_carrinhos_updated on public.carrinhos;
drop trigger if exists trg_chromebooks_updated on public.chromebooks;
drop trigger if exists trg_config_updated on public.configuracoes_site;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_protege_cargo on public.perfis;
create trigger trg_protege_cargo
  before update on public.perfis
  for each row execute function public.protege_cargo();

drop trigger if exists trg_protege_agendamento on public.agendamentos;
create trigger trg_protege_agendamento
  before update on public.agendamentos
  for each row execute function public.protege_agendamento();

drop trigger if exists trg_valida_agendamento on public.agendamentos;
create trigger trg_valida_agendamento
  before insert or update on public.agendamentos
  for each row execute function public.valida_agendamento();

drop trigger if exists trg_audita_agendamento on public.agendamentos;
create trigger trg_audita_agendamento
  before update on public.agendamentos
  for each row execute function public.registra_aprovacao();

drop trigger if exists trg_updated_agendamentos on public.agendamentos;
create trigger trg_updated_agendamentos
  before update on public.agendamentos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_updated_perfis on public.perfis;
create trigger trg_updated_perfis
  before update on public.perfis
  for each row execute function public.set_updated_at();

drop trigger if exists trg_updated_carrinhos on public.carrinhos;
create trigger trg_updated_carrinhos
  before update on public.carrinhos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_updated_chromebooks on public.chromebooks;
create trigger trg_updated_chromebooks
  before update on public.chromebooks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_updated_config on public.configuracoes_site;
create trigger trg_updated_config
  before update on public.configuracoes_site
  for each row execute function public.set_updated_at();

-- ============ 6. RLS ============
alter table public.perfis              enable row level security;
alter table public.agendamentos        enable row level security;
alter table public.carrinhos           enable row level security;
alter table public.chromebooks         enable row level security;
alter table public.turmas              enable row level security;
alter table public.horarios_aula       enable row level security;
alter table public.eventos_especiais   enable row level security;
alter table public.configuracoes_site  enable row level security;
alter table public.banners             enable row level security;

-- ---------- perfis ----------
drop policy if exists "perfil_select_proprio" on public.perfis;
create policy "perfil_select_proprio" on public.perfis
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "perfil_admin_ve_todos" on public.perfis;
create policy "perfil_admin_ve_todos" on public.perfis
  for select to authenticated
  using (public.is_admin());

-- Só pode criar o próprio perfil como professor (o trigger ignora RLS)
drop policy if exists "perfil_insert_proprio" on public.perfis;
create policy "perfil_insert_proprio" on public.perfis
  for insert to authenticated
  with check (auth.uid() = id and cargo = 'professor');

drop policy if exists "perfil_update_proprio" on public.perfis;
create policy "perfil_update_proprio" on public.perfis
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "perfil_admin_gerencia" on public.perfis;
create policy "perfil_admin_gerencia" on public.perfis
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- policies antigas, redundantes com perfil_admin_gerencia
drop policy if exists "perfil_admin_select_todos" on public.perfis;
drop policy if exists "perfil_admin_update_todos" on public.perfis;

-- ---------- agendamentos ----------
-- Ninguém anônimo lê a tabela: o calendário público usa a view agenda_publica.
drop policy if exists "ag_select_publico" on public.agendamentos;

drop policy if exists "ag_select_equipe" on public.agendamentos;
create policy "ag_select_equipe" on public.agendamentos
  for select to authenticated
  using (auth.uid() = usuario_id);

drop policy if exists "ag_insert_proprio" on public.agendamentos;
create policy "ag_insert_proprio" on public.agendamentos
  for insert to authenticated
  with check (auth.uid() = usuario_id);

drop policy if exists "ag_update_proprio" on public.agendamentos;
create policy "ag_update_proprio" on public.agendamentos
  for update to authenticated
  using (auth.uid() = usuario_id)
  with check (auth.uid() = usuario_id);

drop policy if exists "ag_admin_gerencia" on public.agendamentos;
create policy "ag_admin_gerencia" on public.agendamentos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- professor cancela (soft delete); não apaga o histórico
drop policy if exists "ag_delete_proprio" on public.agendamentos;
-- duplicadas das permissões do admin
drop policy if exists "ag_admin_delete_todos" on public.agendamentos;
drop policy if exists "ag_admin_update_todos" on public.agendamentos;

revoke all on public.agendamentos from anon;

-- ---------- tabelas de leitura pública / escrita do admin ----------
do $$
declare
  v_tabelas text[] := array[
    'carrinhos', 'chromebooks', 'turmas', 'horarios_aula', 'eventos_especiais'
  ];
  t text;
begin
  foreach t in array v_tabelas
  loop
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_leitura', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin', t
    );
  end loop;
end $$;

-- ---------- configurações do site ----------
drop policy if exists "config_leitura" on public.configuracoes_site;
create policy "config_leitura" on public.configuracoes_site
  for select to anon, authenticated using (true);

drop policy if exists "config_admin" on public.configuracoes_site;
create policy "config_admin" on public.configuracoes_site
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- banners ----------
drop policy if exists "banners_leitura" on public.banners;
create policy "banners_leitura" on public.banners
  for select to anon, authenticated using (true);

drop policy if exists "banners_admin" on public.banners;
create policy "banners_admin" on public.banners
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============ 7. VIEW PÚBLICA (sem dados pessoais) ============
drop view if exists public.agenda_publica;
-- security_invoker = false (padrão): a view roda como o dono e ignora o RLS,
-- expondo apenas estas colunas — nunca nome, sala ou observações.
create view public.agenda_publica as
select
  a.data,
  a.periodo,
  a.horario_id,
  a.quantidade,
  a.status
from public.agendamentos a
where a.status <> 'cancelado';

comment on view public.agenda_publica is
  'Calendário público: apenas data, período, quantidade e status. Sem nome, sala ou observações.';

revoke all on public.agenda_publica from public;
grant select on public.agenda_publica to anon, authenticated;

-- ============ 8. ÍNDICES ============
create index if not exists ix_agendamentos_data        on public.agendamentos (data);
create index if not exists ix_agendamentos_data_hora   on public.agendamentos (data, horario_id);
create index if not exists ix_agendamentos_usuario     on public.agendamentos (usuario_id, data desc);
create index if not exists ix_agendamentos_status      on public.agendamentos (status);
create index if not exists ix_horarios_segmento        on public.horarios_aula (segmento, turno, dia_semana, ordem);
create index if not exists ix_eventos_periodo          on public.eventos_especiais (data_inicio, data_fim);
create index if not exists ix_chromebooks_carrinho     on public.chromebooks (carrinho_id);

-- Unicidade (ignora erro se já houver duplicatas no banco)
do $$
begin
  begin
    create unique index if not exists ux_turmas_nome on public.turmas (lower(nome));
  exception when others then
    raise notice 'ux_turmas_nome não criado: %', sqlerrm;
  end;
  begin
    create unique index if not exists ux_carrinhos_nome on public.carrinhos (lower(nome));
  exception when others then
    raise notice 'ux_carrinhos_nome não criado: %', sqlerrm;
  end;
  begin
    create unique index if not exists ux_chromebooks_serie
      on public.chromebooks (numero_serie) where numero_serie is not null;
  exception when others then
    raise notice 'ux_chromebooks_serie não criado: %', sqlerrm;
  end;
end $$;

-- ============ 9. STORAGE (bucket de banners) ============
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do update set public = true;

-- policies antigas com o mesmo efeito
drop policy if exists "storage_banners_select" on storage.objects;
drop policy if exists "storage_banners_admin_all" on storage.objects;

drop policy if exists "banners_storage_leitura" on storage.objects;
create policy "banners_storage_leitura" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'banners');

drop policy if exists "banners_storage_insert" on storage.objects;
create policy "banners_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'banners' and public.is_admin());

drop policy if exists "banners_storage_update" on storage.objects;
create policy "banners_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'banners' and public.is_admin())
  with check (bucket_id = 'banners' and public.is_admin());

drop policy if exists "banners_storage_delete" on storage.objects;
create policy "banners_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'banners' and public.is_admin());

-- ============ 10. SEED ============
insert into public.configuracoes_site (id) values (1)
on conflict (id) do nothing;

commit;
