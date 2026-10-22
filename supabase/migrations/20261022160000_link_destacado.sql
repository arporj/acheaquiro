-- "Link patrocinado" passa a se chamar "Link destacado" (decisão de 22/10/2026),
-- para não confundir com os Patrocinadores (empresas que apoiam o site como
-- marca). Mudam o código público, o nome e a descrição; valores e regras ficam.

update public.extras e
set codigo = n.codigo_novo,
    nome = n.nome,
    descricao = n.descricao
from (values
  ('link-patrocinado', 'link-destacado', 'Link destacado nos bairros',
   'Uma das 3 primeiras posições da lista da sua categoria, quando o visitante escolhe um dos 3 bairros do pacote. Com mais de 3 destacados, há sorteio a cada busca. Você continua também na sua posição normal da lista.'),
  ('patrocinado-plus', 'destacado-plus', 'Destacado Plus nos bairros',
   'Igual ao link destacado nos bairros, com o dobro de chance no sorteio.'),
  ('link-patrocinado-cidade', 'link-destacado-cidade', 'Link destacado na cidade toda',
   'Uma das 3 primeiras posições da lista da sua categoria em todas as buscas, com ou sem bairro escolhido. No máximo 3 por categoria. Você continua também na sua posição normal da lista.')
) as n (codigo_antigo, codigo_novo, nome, descricao)
where e.codigo = n.codigo_antigo;

-- Conferência: nenhum código antigo pode sobrar, e os 3 novos precisam existir.
do $$
begin
  if exists (select 1 from public.extras where codigo in ('link-patrocinado', 'patrocinado-plus', 'link-patrocinado-cidade')) then
    raise exception 'Ainda há extras com o código antigo de link patrocinado';
  end if;
  if (select count(*) from public.extras where codigo in ('link-destacado', 'destacado-plus', 'link-destacado-cidade')) <> 3 then
    raise exception 'Os 3 extras de link destacado não foram encontrados';
  end if;
end $$;
