# Agendamento de Chromebooks 💻

Sistema web de agendamento de Chromebooks para o Laboratório Móvel da escola, com calendário público de disponibilidade, painel do professor, solicitações de visitantes e painel administrativo completo.

**Stack:** HTML + JavaScript puro (sem build) · Tailwind (CDN) · [Supabase](https://supabase.com) (banco + autenticação) · hospedagem no GitHub Pages.

---

## 📁 Estrutura

```
/
├── index.html
├── login.html
├── admin-login.html
├── agendamento-usuario.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── supabase-client.js
│       ├── utils.js
│       ├── theme.js
│       ├── guard.js
│       ├── auth.js
│       ├── calendar.js
│       ├── agendamento.js
│       └── admin.js
├── admin/
│   └── index.html
└── README.md
    └── setup.sql               → ⭐ Script de criação do banco (RODE ISTO!)
```

## 🗄️ 1. Configurar o Supabase (obrigatório)

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e abra o seu projeto.
2. No menu lateral, clique em **SQL Editor → New query**.
3. Cole **todo o conteúdo** de [`supabase/setup.sql`](supabase/setup.sql) e clique em **Run**.
4. O script cria (sem apagar dados existentes):
   - `perfis` — nome, cargo (`professor`/`admin`);
   - `agendamentos` — as reservas (mantém a tabela que já existia e adiciona `campos_extras`);
   - `chromebooks` — nome, nº de série, nº patrimônio/atribuído, modelo, carrinho e status;
   - `carrinhos` — grupos de **até 45 Chromebooks** com nome e limite;
   - `config_formulario` — campos/horários/regras do formulário editáveis pelo admin;
   - Políticas de segurança (RLS), criação automática de perfil ao cadastrar e tempo real.

### Tornar-se administrador
Crie sua conta pela página de login e depois rode no SQL Editor:

```sql
insert into public.perfis (id, email, nome_completo, cargo)
select id, email, coalesce(raw_user_meta_data ->> 'nome_completo', split_part(email, '@', 1)), 'admin'
from auth.users
where email = 'seuemail@escola.com'
on conflict (id) do update set cargo = 'admin';
```

### Autenticação (opcional, recomendado)
Em **Authentication → URL Configuration**, defina o *Site URL* como o endereço do site no GitHub Pages (ex.: `https://seuusuario.github.io/Agendamento-de-Chromes/`) para o link de recuperação de senha funcionar.

## 🌐 2. Publicar no GitHub Pages

1. Suba o conteúdo da pasta para o repositório (a raiz do repositório deve ter o `index.html`).
2. No repositório: **Settings → Pages → Branch: `main` (ou `master`) → pasta `/ (root)` → Save**.
3. Pronto — o site fica em `https://seuusuario.github.io/nome-do-repositorio/`.

> As páginas usam apenas links relativos, então funcionam em qualquer caminho.

## ✨ Funcionalidades

| Página | O que faz |
| --- | --- |
| **Calendário** | Mostra a semana (seg–sex) com os horários configurados, quantidade reservada por aula (ex.: `38/90`), legenda e atualização em tempo real. |
| **Professor** | Agenda com formulário dinâmico, valida 24 h de antecedência, fim de semana, capacidade do horário e reserva duplicada. A partir do limite diário (padrão: 3), a reserva entra como **pendente**. Permite cancelar. |
| **Visitante** | Qualquer pessoa solicita sem login; a solicitação sempre vai para **aprovação do admin**. |
| **Admin → Reservas** | Aprova/recusa pendências, exclui confirmados, busca e exporta CSV. |
| **Admin → Chromebooks** | Cadastra/edita/exclui aparelhos com **nome, nº de série, nº patrimônio, modelo**, carrinho e status. |
| **Admin → Carrinhos** | Cria/edita/exclui **carrinhos de até 45 aparelhos**, com barra de ocupação. |
| **Admin → Formulário** | Edita os **campos do formulário** (rótulo, obrigatório, ativo, ordem, opções), adiciona campos personalizados, edita os **horários de aula** e as regras (limite por horário, antecedência, limite diário). |

## 🔧 Solução de problemas

- **"Tabela não encontrada"** → o `supabase/setup.sql` não foi executado. Rode-o no SQL Editor.
- **"Permissão negada (RLS)"** → rode novamente o `setup.sql` (ele recria as políticas).
- **Aprovação de visitantes não aparece** → confirme que o usuário tem `cargo = 'admin'` na tabela `perfis`.
- **Recuperação de senha sem e-mail** → configure o *Site URL* em Authentication → URL Configuration.
- **Calendário sem dados após editar horários** → reservas antigas guardam o texto do horário antigo; edite os horários antes de começar a usar.

## 🧱 Detalhes técnicos

- Os **ícones são SVG embutidos** no `assets/js/icons.js` (traçados do Lucide, licença ISC) — nunca dependem de CDN.
- O formulário de agendamento é **gerado a partir da tabela `config_formulario`**; se a tabela não existir, o site usa uma configuração padrão e continua funcionando.
- Campos personalizados criados pelo admin são salvos em `agendamentos.campos_extras` (JSONB).
- A capacidade padrão é de **90 aparelhos por horário** (dois carrinhos cheios).
