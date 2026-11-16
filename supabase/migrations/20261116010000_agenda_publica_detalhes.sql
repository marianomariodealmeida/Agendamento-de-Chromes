-- ============================================================================
-- ChromeAgenda — detalhes públicos do agendamento
-- ----------------------------------------------------------------------------
-- Inclui na view pública:
--   • professor_nome  (quem agendou)
--   • turma_nome      (turma do agendamento)
--
-- Continua sem expor sala e observações.
--
-- Idempotente: pode ser executado mais de uma vez no SQL Editor do Supabase.
-- ============================================================================

begin;

drop view if exists public.agenda_publica;

create view public.agenda_publica as
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
  'Calendário público: data, período, horário, quantidade, status, professor e turma. Sem sala ou observações.';

revoke all on public.agenda_publica from public;
grant select on public.agenda_publica to anon, authenticated;

-- PostgREST recarrega o cache e passa a enxergar as novas colunas na hora.
notify pgrst, 'reload schema';

commit;
