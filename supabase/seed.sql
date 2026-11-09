-- ============================================================================
-- Dados de exemplo (OPCIONAL)
-- Rode apenas se as tabelas estiverem vazias. Não sobrescreve nada.
-- ============================================================================

insert into public.carrinhos (nome, descricao, localizacao)
select 'Carrinho A', 'Carrinho móvel de Chromebooks', 'Sala dos professores'
where not exists (select 1 from public.carrinhos where nome = 'Carrinho A');

insert into public.carrinhos (nome, descricao, localizacao)
select 'Carrinho B', 'Carrinho móvel de Chromebooks', 'Corredor do bloco B'
where not exists (select 1 from public.carrinhos where nome = 'Carrinho B');

insert into public.turmas (nome, segmento, turno)
select '9ºA', 'fund2', 'manha'
where not exists (select 1 from public.turmas where lower(nome) = lower('9ºA'));

insert into public.turmas (nome, segmento, turno)
select '9ºB', 'fund2', 'tarde'
where not exists (select 1 from public.turmas where lower(nome) = lower('9ºB'));

insert into public.horarios_aula (segmento, turno, dia_semana, rotulo, hora_inicio, hora_fim, ordem)
select 'fund2', 'manha', 'padrao', '1ª aula', '07:00', '07:50', 1
where not exists (
  select 1 from public.horarios_aula
   where segmento = 'fund2' and turno = 'manha' and rotulo = '1ª aula'
);

insert into public.horarios_aula (segmento, turno, dia_semana, rotulo, hora_inicio, hora_fim, ordem)
select 'fund2', 'manha', 'padrao', '2ª aula', '07:50', '08:40', 2
where not exists (
  select 1 from public.horarios_aula
   where segmento = 'fund2' and turno = 'manha' and rotulo = '2ª aula'
);
