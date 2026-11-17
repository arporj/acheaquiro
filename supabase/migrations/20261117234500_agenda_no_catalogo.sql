-- Agenda no catálogo da administração (17/11/2026):
-- - os extras Agenda e Evento avulso vão para o fim da lista de extras (a
--   migration 20261117233134 os criou com a ordem 0, no topo);
-- - "Inclui a Agenda" passa a ser editável nos planos de comércio, em
--   /admin/catalogo (até aqui, só o Premium de comércio, fixado na migration
--   da Agenda). O autônomo não tem Agenda própria: o artista anunciante
--   cadastra os shows pela categoria "Músicos e bandas".

update public.extras e
set ordem = (select coalesce(max(o.ordem), 0) from public.extras o where o.cidade_id = e.cidade_id and o.codigo not in ('agenda', 'evento-avulso'))
            + case e.codigo when 'agenda' then 1 else 2 end
where e.codigo in ('agenda', 'evento-avulso');

alter table public.planos
  add constraint planos_agenda_so_comercio check (not inclui_agenda or tipo = 'comercio');

/** Como antes (migration 20261027190000), com "Inclui a Agenda" (incluiAgenda; ausente, fica como está). */
create or replace function public.salvar_plano(p_plano uuid, p_antes jsonb, p_dados jsonb, p_avisos jsonb) returns integer
language plpgsql volatile
set search_path = ''
as $$
declare
  atual record;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração altera os planos.';
  end if;
  select p.valor_mensal_centavos, p.meses_cobrados_no_anual into atual from public.planos p where p.id = p_plano for update;
  if atual.valor_mensal_centavos is null then
    raise exception 'Plano não encontrado.';
  end if;
  if atual.valor_mensal_centavos <> (p_antes ->> 'valorMensalCentavos')::integer
     or atual.meses_cobrados_no_anual <> (p_antes ->> 'mesesCobradosNoAnual')::integer then
    raise exception 'Outra pessoa mudou este plano agora. Atualize a página.';
  end if;

  update public.planos
  set nome = p_dados ->> 'nome',
      valor_mensal_centavos = (p_dados ->> 'valorMensalCentavos')::integer,
      meses_cobrados_no_anual = (p_dados ->> 'mesesCobradosNoAnual')::smallint,
      limite_fotos = (p_dados ->> 'limiteFotos')::integer,
      limite_categorias_adicionais = (p_dados ->> 'limiteCategoriasAdicionais')::integer,
      limite_encartes_semana = (p_dados ->> 'limiteEncartesSemana')::integer,
      limite_produtos = (p_dados ->> 'limiteProdutos')::integer,
      limite_enderecos = (p_dados ->> 'limiteEnderecos')::integer,
      tem_relatorio = (p_dados ->> 'temRelatorio')::boolean,
      inclui_agenda = coalesce((p_dados ->> 'incluiAgenda')::boolean, inclui_agenda)
  where id = p_plano;

  if jsonb_array_length(coalesce(p_avisos, '[]'::jsonb)) = 0 then
    return 0;
  end if;
  return public.avisar_novo_preco(p_avisos);
end
$$;
