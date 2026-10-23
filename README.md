# ChromeAgenda — Agendamento de Chromebooks

Sistema de agendamento do carrinho móvel de Chromebooks, feito em HTML + CSS + JS puro com **Supabase** como backend.

## 1. Configuração do Supabase

1. Crie um projeto em https://supabase.com
2. Vá em **SQL Editor** e execute o script abaixo.
3. Copie a **Project URL** e a **anon public key** (Settings → API) para `assets/js/supabase-client.js`.

### SQL (schema + RLS + trigger)

```sql
-- ============ TABELAS ============
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  cargo text not null default 'professor' check (cargo in ('professor','admin')),
  created_at timestamptz default now()
);

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete cascade,
  professor_nome text,
  data date not null,
  periodo text not null check (periodo in ('manha','tarde','noite')),
  quantidade int not null default 1 check (quantidade between 1 and 40),
  sala text,
  observacoes text,
  status text not null default 'pendente' check (status in ('pendente','aprovado','cancelado')),
  created_at timestamptz default now()
);

create index if not exists idx_agendamentos_data on public.agendamentos (data);

-- ============ HELPER: é admin? ============
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis where id = auth.uid() and cargo = 'admin'
  );
$$;

-- ============ RLS ============
alter table public.perfis enable row level security;
alter table public.agendamentos enable row level security;

-- perfis
drop policy if exists "perfil_select_proprio" on public.perfis;
create policy "perfil_select_proprio" on public.perfis
  for select using (auth.uid() = id);

drop policy if exists "perfil_insert_proprio" on public.perfis;
create policy "perfil_insert_proprio" on public.perfis
  for insert with check (auth.uid() = id);

drop policy if exists "perfil_update_proprio" on public.perfis;
create policy "perfil_update_proprio" on public.perfis
  for update using (auth.uid() = id);

drop policy if exists "perfil_admin_ve_todos" on public.perfis;
create policy "perfil_admin_ve_todos" on public.perfis
  for select using (public.is_admin());

-- agendamentos
drop policy if exists "ag_select_publico" on public.agendamentos;
create policy "ag_select_publico" on public.agendamentos
  for select using (true);          -- calendário público (só leitura)

drop policy if exists "ag_insert_proprio" on public.agendamentos;
create policy "ag_insert_proprio" on public.agendamentos
  for insert with check (auth.uid() = usuario_id);

drop policy if exists "ag_update_proprio" on public.agendamentos;
create policy "ag_update_proprio" on public.agendamentos
  for update using (auth.uid() = usuario_id);

drop policy if exists "ag_admin_gerencia" on public.agendamentos;
create policy "ag_admin_gerencia" on public.agendamentos
  for update using (public.is_admin());

-- ============ TRIGGER: cria perfil ao registrar ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, cargo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    'professor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### Promover um usuário a administrador

Cadastre-se normalmente pelo site e depois rode no SQL Editor:

```sql
update public.perfis set cargo = 'admin' where email = 'seu.email@escola.edu.br';
```

Depois disso, o login por `admin-login.html` já funciona.

## 2. Estrutura

```
index.html                  → página inicial + calendário público
login.html                  → login/cadastro de professores
admin-login.html            → login exclusivo do administrador
agendamento-usuario.html    → painel do professor
admin/index.html            → dashboard do administrador
assets/css/styles.css       → tema claro/escuro + componentes
assets/js/*.js              → módulos (supabase, tema, auth, calendário, admin)
```

## 3. Dicas

- Se o Supabase estiver com **"Confirm email" ativado** (padrão), o usuário precisa confirmar o e-mail antes do primeiro login. Para testes, desative em *Authentication → Providers → Email*.
- Em *Authentication → URL Configuration*, adicione a URL do seu GitHub Pages em **Site URL** e **Redirect URLs**.
- O modo escuro é salvo em `localStorage` com a chave `chromeagenda-theme`.
