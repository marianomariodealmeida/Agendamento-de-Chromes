# ChromeAgenda — Agendamento de Chromebooks

Sistema de agendamento do carrinho móvel de Chromebooks de uma escola. Front-end em HTML + CSS + JS puro (sem build) hospedado no **GitHub Pages** e backend no **Supabase** (Postgres + Auth + Storage). Todo o projeto roda no plano gratuito dos dois serviços.

---

## 1. Como está organizado

```
index.html                    página inicial + calendário público
login.html                    login/cadastro de professores
admin-login.html              login exclusivo do administrador
agendamento-usuario.html      painel do professor (pedidos + cancelamento)
agendamento-visitante.html    redireciona para o login (fluxo externo desativado)
admin.html                    atalho que redireciona para admin/
admin/index.html              dashboard do administrador
404.html                      página de erro do GitHub Pages

assets/css/styles.css         tema claro/escuro + componentes
assets/js/
  supabase-client.js          URL + anon key do projeto
  utils.js                    helpers (datas, escape, toast)
  theme.js                    tema claro/escuro
  guard.js                    sessão, perfis e proteção de rotas
  auth.js                     login e cadastro
  site-config.js              identidade visual vinda do banco
  banners.js                  carrossel da home
  calendar.js                 calendário público (view agenda_publica)
  horarios.js                 horários, turmas e bloqueios
  agendamento.js              regras do pedido do professor
  admin.js                    dashboard administrativo

supabase/
  00_diagnostico.sql          consulta o estado atual (não altera nada)
  01_transicao_view.sql       cria só a view pública (deploy sem downtime)
  schema.sql                  schema completo e idempotente (fonte única)
  migrations/                 mesma DDL, para quem usa a CLI
  seed.sql                    dados de exemplo opcionais

scripts/check-assets.mjs      confere se todo asset referenciado existe
.github/workflows/ci.yml      sintaxe JS + assets + varredura de segredos
.github/workflows/keep-alive.yml  evita a pausa do projeto free do Supabase
```

---

## 2. Configuração do Supabase (do zero)

1. Crie um projeto em <https://supabase.com> (o plano free permite 2).
2. Em **SQL Editor**, rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
   - O script é idempotente: pode ser executado de novo sem quebrar nada.
   - Ele cria tabelas, colunas, índices, triggers, policies de RLS, a view
     pública `agenda_publica`, o bucket `banners` e a linha inicial de
     `configuracoes_site`.

> **Atualizando um site que já está no ar:** rode primeiro
> [`supabase/01_transicao_view.sql`](supabase/01_transicao_view.sql), que só
> cria a view pública. Depois publique o front-end novo e, por último,
> `schema.sql` (que revoga a leitura anônima da tabela `agendamentos`).
> Assim o calendário não fica fora do ar durante o deploy.

> **Projeto pausado:** no plano free o banco é pausado após alguns dias sem
> uso. Restaure em *Project Settings → General* ou com
> `POST /v1/projects/{ref}/restore`. O workflow [`keep-alive`](.github/workflows/keep-alive.yml)
> evita que isso volte a acontecer.
3. Copie **Project URL** e **anon public key** (Settings → API) para
   `assets/js/supabase-client.js`.
4. Em **Authentication → URL Configuration**, defina:
   - *Site URL*: `https://SEU-USUARIO.github.io/Agendamento-de-Chromes/`
   - *Redirect URLs*: a mesma URL e `.../login.html`
5. Em **Authentication → Providers → Email**:
   - Para testes, desative *Confirm email*.
   - Em produção, mantenha ativado e cadastre os professores pelo admin.
6. Em **Authentication → Policies** (ou *Security*), ative
   **Leaked password protection**.

### Promover um administrador

Cadastre-se pelo site e rode:

```sql
update public.perfis set cargo = 'admin' where email = 'seu.email@escola.edu.br';
```

Depois disso o login por `admin-login.html` funciona.

> A partir do novo schema, **nenhum usuário consegue promover a si mesmo**:
> um trigger bloqueia alteração de `cargo` feita por quem não é admin.

---

## 3. Deploy no GitHub Pages

1. **Settings → Pages → Source**: branch `main`, pasta `/ (root)`.
2. Aguarde o build. O site fica em `https://SEU-USUARIO.github.io/Agendamento-de-Chromes/`.
3. `robots.txt`, `sitemap.xml` e `404.html` já estão preparados; ajuste o
   domínio neles se mudar de repositório.
4. `.nojekyll` está incluído para evitar qualquer processamento do Jekyll.

---

## 4. Modelo de permissões (RLS)

| Tabela | Anônimo | Professor | Admin |
|---|---|---|---|
| `perfis` | — | lê/edita o próprio (sem `cargo`) | tudo |
| `agendamentos` | só via `agenda_publica` | lê/cria/cancela **só os próprios** | tudo |
| `carrinhos`, `chromebooks`, `turmas`, `horarios_aula`, `eventos_especiais` | leitura | leitura | tudo |
| `configuracoes_site`, `banners` | leitura | leitura | tudo |
| `storage.objects` (bucket `banners`) | leitura | leitura | escrita |

Regras aplicadas por trigger (não só pelo front-end):

- professor **não** altera `cargo`;
- professor **não** aprova o próprio pedido (só cancela);
- conflito de carrinhos é resolvido com `pg_advisory_xact_lock` (atômico);
- capacidade validada contra `chromebooks.status = 'disponivel'`;
- eventos especiais e antecedência mínima valem também para quem chamar a API direto;
- `aprovado_por` / `aprovado_em` registram a auditoria.

A view `agenda_publica` expõe apenas `data`, `periodo`, `horario_id`,
`quantidade` e `status` — sem nome de professor, sala ou observações.

---

## 5. Rodar localmente

Não há build. Como o site conversa com o Supabase por `https`, sirva por HTTP
(abrir `file://` pode ser bloqueado por CORS):

```bash
npx serve .
# ou
python -m http.server 8080
```

---

## 6. Manutenção no plano gratuito

- **Pausa automática**: projetos free são pausados após alguns dias sem uso.
  O workflow `.github/workflows/keep-alive.yml` faz um GET a cada 3 dias para
  manter o projeto ativo, sem precisar de segredo (usa a anon key que já é pública).
- **Backup**: o plano free não tem backup automático. Faça um dump semanal
  (local ou como *artifact* do Actions):

  ```bash
  pg_dump "postgresql://postgres.SEU_REF:SUA_SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres" \
    --schema=public --no-owner -f backup-$(date +%F).sql
  ```

- **E-mail**: o SMTP embutido do Supabase tem limite baixo de envios por hora.
  Para uma escola, prefira que o admin cadastre os usuários.

---

## 7. Testes de segurança (faça depois de aplicar o schema)

1. Logado como professor, no console do navegador:

   ```js
   const { data } = await db.auth.getUser();
   await db.from("perfis").update({ cargo: "admin" }).eq("id", data.user.id);
   ```
   Deve retornar erro `42501` (permission denied).

2. Como professor, tentar aprovar o próprio pedido:

   ```js
   await db.from("agendamentos").update({ status: "aprovado" }).eq("id", "SEU_ID");
   ```
   Deve falhar com `42501`.

3. Deslogado, acessar:

   ```
   /rest/v1/agendamentos?select=professor_nome
   ```
   Deve retornar lista vazia ou `401/403`.

   ```
   /rest/v1/agenda_publica?select=*
   ```
   Deve retornar apenas as 5 colunas públicas.

4. Como admin, os passos 1 e 2 devem funcionar.

### Resultado da verificação aplicada em 09/11/2026

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 1 | professor tenta se promover a admin | erro `42501` | ✅ |
| 2 | professor tenta aprovar o próprio pedido | erro `42501` | ✅ |
| 3 | professor tenta trocar data/horário do pedido | erro `42501` | ✅ |
| 4 | professor tenta renomear outro perfil | 0 linhas afetadas | ✅ |
| 5 | professor cancela o próprio pedido pendente | permitido | ✅ |
| 6 | admin altera cargo de professor | permitido | ✅ |
| 7 | admin aprova pedido de outro (grava `aprovado_por`) | permitido | ✅ |
| 8 | professor lê pedidos de outro colega | 0 linhas | ✅ |
| 9 | anônimo lê `public.agendamentos` | `401` / `42501` | ✅ |
| 10 | colunas de `agenda_publica` | só as 5 públicas | ✅ |
| 11 | dois pedidos no mesmo horário (2 carrinhos) | permitido | ✅ |
| 12 | terceiro pedido no mesmo horário | erro `P0004` | ✅ |
| 13 | pedido para hoje, dentro da antecedência mínima | erro `P0003` | ✅ |

---

## 8. CI

O workflow `CI` roda em todo push/PR:

- `node --check` em todos os arquivos de `assets/js`;
- `scripts/check-assets.mjs` (garante que nenhum `src`/`href` local está quebrado);
- varredura simples de chaves sensíveis (`service_role`, `sbp_`, `github_pat_`).

---

## 9. Observações

- A `anon key` é pública por definição e pode ficar no repositório. A segurança
  vem do RLS. **Nunca** commite a `service_role key`.
- O fluxo de agendamento sem login (`agendamento-visitante.html`) foi desativado:
  ele dependia de arquivos que não existiam no repositório e exigiria uma policy
  de `insert` anônimo (risco de spam). Se quiser retomá-lo, crie a policy e o
  formulário do zero, de preferência com captcha.
