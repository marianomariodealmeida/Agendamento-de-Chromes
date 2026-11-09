-- ============================================================================
-- ChromeAgenda — diagnóstico do banco ANTES de aplicar qualquer migration
-- ----------------------------------------------------------------------------
-- Rode no SQL Editor e guarde o resultado. Ele não altera nada.
-- ============================================================================

-- 1. Tabelas e colunas existentes
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
 order by table_name, ordinal_position;

-- 2. Policies atuais (o mais importante: procure "using (true)" em tabelas com dados pessoais)
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;

-- 3. RLS ligado?
select c.relname as tabela, c.relrowsecurity as rls_ativo, c.relforcerowsecurity as rls_forcado
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relname;

-- 4. Triggers em public e em auth.users
select n.nspname as schema, c.relname as tabela, t.tgname as trigger,
       pg_get_triggerdef(t.oid) as definicao
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal
   and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
 order by 1, 2, 3;

-- 5. Funções existentes
select n.nspname as schema, p.proname as funcao, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by 1, 2;

-- 6. Constraints de check (veja o que existe para periodo/status/cargo)
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid::regclass::text like 'public.%'
   and contype in ('c', 'f')
 order by 1, 2;

-- 7. Índices
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
 order by tablename, indexname;

-- 8. Buckets de storage
select id, name, public, file_size_limit, allowed_mime_types
  from storage.buckets
 order by id;

-- 9. Volumes (ajuda a decidir se o backup por SQL é suficiente)
select 'perfis' as tabela, count(*) from public.perfis
union all select 'agendamentos', count(*) from public.agendamentos
union all select 'carrinhos', count(*) from public.carrinhos
union all select 'chromebooks', count(*) from public.chromebooks
union all select 'turmas', count(*) from public.turmas
union all select 'horarios_aula', count(*) from public.horarios_aula
union all select 'eventos_especiais', count(*) from public.eventos_especiais
union all select 'banners', count(*) from public.banners
union all select 'configuracoes_site', count(*) from public.configuracoes_site;

-- 10. Valores que podem impedir a criação das novas constraints
select 'periodo fora do padrão' as problema, periodo as valor, count(*)
  from public.agendamentos
 where periodo not in ('manha', 'tarde', 'noite', 'aula')
 group by periodo
union all
select 'quantidade fora de 1..40', quantidade::text, count(*)
  from public.agendamentos
 where quantidade < 1 or quantidade > 40
 group by quantidade
union all
select 'cargo desconhecido', cargo, count(*)
  from public.perfis
 where cargo not in ('professor', 'admin')
 group by cargo;

-- 11. Possíveis duplicatas (bloqueiam os índices únicos)
select 'turmas' as tabela, lower(nome) as chave, count(*)
  from public.turmas group by 1, 2 having count(*) > 1
union all
select 'carrinhos', lower(nome), count(*)
  from public.carrinhos group by 1, 2 having count(*) > 1
union all
select 'chromebooks', numero_serie, count(*)
  from public.chromebooks
 where numero_serie is not null
 group by 1, 2 having count(*) > 1;
