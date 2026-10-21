-- ============================================================================
--  AGENDAMENTO DE CHROMEBOOKS — CONFIGURAÇÃO DO BANCO (Supabase)
-- ----------------------------------------------------------------------------
--  COMO USAR:
--   1. Abra o painel do seu projeto no Supabase (supabase.com/dashboard)
--   2. No menu lateral, clique em "SQL Editor"
--   3. Cole TODO este arquivo e clique em "Run"
--   4. (Opcional) Promova um usuário a administrador — veja o final do arquivo
--
--  O script é seguro para rodar mais de uma vez (idempotente).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PERFIS (professores / administradores)
--    A tabela já pode existir; apenas completamos colunas que faltarem.
-- ----------------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_completo text,
  email text,
  cargo text not null default 'professor',
  criado_em timestamptz not null default now()
);

alter table public.perfis add column if not exists email text;
alter table public.perfis add column if not exists cargo text not null default 'professor';
alter table public.perfis add column if not exists criado_em timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- 2) CARRINHOS — grupos de até 45 Chromebooks
-- ----------------------------------------------------------------------------
create table if not exists public.carrinhos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  limite int not null default 45 check (limite between 1 and 45),
  criado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3) CHROMEBOOKS — inventário dos aparelhos
-- ----------------------------------------------------------------------------
create table if not exists public.chromebooks (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero_serie text,
  numero_patrimonio text,
  modelo text,
  carrinho_id uuid references public.carrinhos(id) on delete set null,
  status text not null default 'disponivel',   -- disponivel | manutencao | inativo
  observacoes text,
  criado_em timestamptz not null default now()
);

create unique index if not exists chromebooks_numero_serie_uniq
  on public.chromebooks (numero_serie)
  where numero_serie is not null and numero_serie <> '';

-- ----------------------------------------------------------------------------
-- 4) AGENDAMENTOS — mantém a tabela existente e adiciona campos novos
-- ----------------------------------------------------------------------------
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid references auth.users(id) on delete set null,
  teacher_name text not null,
  room text,
  class_group text,
  section text,
  date date not null,
  time_slot text not null,
  quantidade int not null default 45,
  status text not null default 'pendente',     -- pendente | confirmado | cancelado
  eh_visitante boolean not null default false,
  campos_extras jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

alter table public.agendamentos add column if not exists campos_extras jsonb not null default '{}'::jsonb;
alter table public.agendamentos add column if not exists criado_em timestamptz not null default now();

create index if not exists agendamentos_date_idx on public.agendamentos (date);
create index if not exists agendamentos_slot_idx on public.agendamentos (date, time_slot);

-- ----------------------------------------------------------------------------
-- 5) CONFIGURAÇÃO DO FORMULÁRIO — linha única (id = 1) editada pelo admin
-- ----------------------------------------------------------------------------
create table if not exists public.config_formulario (
  id int primary key default 1 check (id = 1),
  campos jsonb not null,
  horarios jsonb not null,
  limite_por_horario int not null default 90,
  antecedencia_horas int not null default 24,
  limite_diario_professor int not null default 3,
  atualizado_em timestamptz not null default now()
);

insert into public.config_formulario (id, campos, horarios)
values (
  1,
  jsonb_build_array(
    jsonb_build_object('chave','teacher_name','tipo','text','label','Professor(a)','obrigatorio',true,'ativo',true,'fixo',true,'opcoes','[]'::jsonb,'placeholder','Nome do professor(a)','padrao',''),
    jsonb_build_object('chave','room','tipo','select','label','Sala','obrigatorio',true,'ativo',true,'fixo',false,
      'opcoes', (select jsonb_agg(n::text order by n) from generate_series(1, 33) n),
      'placeholder','Escolha a sala','padrao',''),
    jsonb_build_object('chave','quantity','tipo','number','label','Qtd. de aparelhos','obrigatorio',true,'ativo',true,'fixo',true,'opcoes','[]'::jsonb,'placeholder','','padrao',45,'min',1,'max',45),
    jsonb_build_object('chave','class_group','tipo','select','label','Turma','obrigatorio',true,'ativo',true,'fixo',false,
      'opcoes', jsonb_build_array(
        '1º ano Fundamental','2º ano Fundamental','3º ano Fundamental','4º ano Fundamental',
        '5º ano Fundamental','6º ano Fundamental','7º ano Fundamental','8º ano Fundamental',
        '9º ano Fundamental','1º ano Médio','2º ano Médio','3º ano Médio',
        'Contraturno 1','Contraturno 2','Contraturno 3','Contraturno 4'),
      'placeholder','Selecione a turma','padrao',''),
    jsonb_build_object('chave','section','tipo','select','label','Seção','obrigatorio',true,'ativo',true,'fixo',false,
      'opcoes', jsonb_build_array('A','B','C','D','E','F','G'),
      'placeholder','Escolha a seção','padrao',''),
    jsonb_build_object('chave','date','tipo','date','label','Data','obrigatorio',true,'ativo',true,'fixo',true,'opcoes','[]'::jsonb,'placeholder','','padrao',''),
    jsonb_build_object('chave','time_slot','tipo','select','label','Horário','obrigatorio',true,'ativo',true,'fixo',true,'opcoes','[]'::jsonb,'placeholder','Selecione o horário','padrao',''),
    jsonb_build_object('chave','obs','tipo','textarea','label','Observações','obrigatorio',false,'ativo',true,'fixo',false,'opcoes','[]'::jsonb,'placeholder','Detalhes adicionais (opcional)','padrao','')
  ),
  jsonb_build_array(
    '07:00 – 07:45', '07:45 – 08:30', '08:30 – 09:15',
    '09:35 – 10:20', '10:20 – 11:05', '11:05 – 11:50', '11:50 – 12:35'
  )
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 6) TRIGGER — cria automaticamente o perfil quando um usuário se cadastra
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome_completo, cargo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', split_part(new.email, '@', 1)),
    'professor'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 7) SEGURANÇA (RLS)
-- ----------------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.agendamentos enable row level security;
alter table public.chromebooks enable row level security;
alter table public.carrinhos enable row level security;
alter table public.config_formulario enable row level security;

-- Helper: é administrador?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and cargo = 'admin'
  );
$$;

-- ----- PERFIS -----
drop policy if exists "perfis_select" on public.perfis;
create policy "perfis_select" on public.perfis
  for select using ( auth.uid() = id or public.is_admin() );

drop policy if exists "perfis_insert_own" on public.perfis;
create policy "perfis_insert_own" on public.perfis
  for insert with check ( auth.uid() = id );

drop policy if exists "perfis_update_own_admin" on public.perfis;
create policy "perfis_update_own_admin" on public.perfis
  for update using ( auth.uid() = id or public.is_admin() )
  with check ( auth.uid() = id or public.is_admin() );

-- ----- AGENDAMENTOS: todos leem; todos criam; dono e admin editam/excluem -----
drop policy if exists "agendamentos_select_public" on public.agendamentos;
create policy "agendamentos_select_public" on public.agendamentos
  for select using ( true );

drop policy if exists "agendamentos_insert_public" on public.agendamentos;
create policy "agendamentos_insert_public" on public.agendamentos
  for insert with check ( true );

drop policy if exists "agendamentos_update_owner_admin" on public.agendamentos;
create policy "agendamentos_update_owner_admin" on public.agendamentos
  for update
  using ( (auth.uid() is not null and professor_id = auth.uid()) or public.is_admin() )
  with check ( (auth.uid() is not null and professor_id = auth.uid()) or public.is_admin() );

drop policy if exists "agendamentos_delete_owner_admin" on public.agendamentos;
create policy "agendamentos_delete_owner_admin" on public.agendamentos
  for delete
  using ( (auth.uid() is not null and professor_id = auth.uid()) or public.is_admin() );

-- ----- CHROMEBOOKS: leitura pública, escrita só do admin -----
drop policy if exists "chromebooks_select_public" on public.chromebooks;
create policy "chromebooks_select_public" on public.chromebooks
  for select using ( true );

drop policy if exists "chromebooks_write_admin" on public.chromebooks;
create policy "chromebooks_write_admin" on public.chromebooks
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ----- CARRINHOS: leitura pública, escrita só do admin -----
drop policy if exists "carrinhos_select_public" on public.carrinhos;
create policy "carrinhos_select_public" on public.carrinhos
  for select using ( true );

drop policy if exists "carrinhos_write_admin" on public.carrinhos;
create policy "carrinhos_write_admin" on public.carrinhos
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ----- CONFIG: leitura pública, escrita só do admin -----
drop policy if exists "config_select_public" on public.config_formulario;
create policy "config_select_public" on public.config_formulario
  for select using ( true );

drop policy if exists "config_write_admin" on public.config_formulario;
create policy "config_write_admin" on public.config_formulario
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ----------------------------------------------------------------------------
-- 8) TEMPO REAL — publica mudanças dos agendamentos no site
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.agendamentos;
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 9) PROMOVER UM ADMINISTRADOR
--    Crie a conta normalmente pela página de login e depois rode o bloco abaixo
--    (troque o e-mail pelo e-mail real da conta). Funciona mesmo se o perfil
--    ainda não existir na tabela perfis.
-- ----------------------------------------------------------------------------
-- insert into public.perfis (id, email, nome_completo, cargo)
-- select id, email, coalesce(raw_user_meta_data ->> 'nome_completo', split_part(email, '@', 1)), 'admin'
-- from auth.users
-- where email = 'seuemail@escola.com'
-- on conflict (id) do update set cargo = 'admin';
-- ============================================================================
