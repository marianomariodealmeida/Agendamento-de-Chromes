-- Etapa de transicao (zero downtime).
-- Cria a view publica ANTES de mesclar o front-end novo e ANTES de revogar
-- o acesso anonimo a public.agendamentos. Assim o site antigo continua
-- funcionando enquanto o deploy do GitHub Pages nao termina.

create or replace view public.agenda_publica as
select
  a.data,
  a.periodo,
  a.horario_id,
  a.quantidade,
  a.status,
  a.professor_nome,
  t.nome as turma_nome
from public.agendamentos a
left join public.turmas t on t.id = a.turma_id
where a.status <> 'cancelado';

comment on view public.agenda_publica is
  'Calendario publico: data, periodo, horario, quantidade, status, professor e turma. Sem sala ou observacoes.';

grant select on public.agenda_publica to anon, authenticated;
