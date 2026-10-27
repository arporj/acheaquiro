-- Salvar o plano e pôr na fila os avisos de novo preço numa transação só
-- (27/10/2026): sem isso, o valor mudaria sem o aviso aos assinantes se a fila
-- falhasse depois, e salvar de novo (com o mesmo valor) não avisaria mais. O
-- servidor manda os valores que leu antes (p_antes): se outra pessoa mudou o
-- plano no meio do caminho, nada é gravado.

create function public.salvar_plano(p_plano uuid, p_antes jsonb, p_dados jsonb, p_avisos jsonb) returns integer
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
      tem_relatorio = (p_dados ->> 'temRelatorio')::boolean
  where id = p_plano;

  if jsonb_array_length(coalesce(p_avisos, '[]'::jsonb)) = 0 then
    return 0;
  end if;
  return public.avisar_novo_preco(p_avisos);
end
$$;

revoke execute on function public.salvar_plano(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_plano(uuid, jsonb, jsonb, jsonb) to authenticated;
