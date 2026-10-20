-- Decisões de 20/10/2026 (Especificação Funcional v12, item 6.4):
-- - Destaque Exclusivo vendido por dia, com bloco de 30 dias seguidos;
-- - link patrocinado em pacote de 3 bairros ou na cidade toda;
-- - descrição e unidade de cada extra, mostradas na página Anuncie aqui;
-- - chave Pix da empresa (item 4.15).
-- Valores dos extras continuam editáveis pela administração (decisão 5 em aberto).

alter table public.extras
  add column descricao text not null default '' check (length(descricao) <= 300),
  add column unidade text check (unidade is null or length(unidade) between 3 and 60),
  -- 'mensal': valor_mensal_centavos por mês. 'por_dia': diária e bloco em regras.
  add column cobranca text not null default 'mensal' check (cobranca in ('mensal', 'por_dia'));

create temporary table extras_novos (
  codigo text primary key,
  nome text not null,
  descricao text not null,
  unidade text,
  valor_mensal_centavos integer not null,
  cobranca text not null,
  permite_anual boolean not null,
  regras jsonb not null
);

insert into extras_novos values
  ('destaque-exclusivo', 'Destaque Exclusivo',
   'Área acima do carrossel, no topo de todas as páginas, só para você nos dias que escolher no calendário.',
   null, 50000, 'por_dia', false,
   '{"vagas":1,"diaria_centavos":2490,"valor_bloco_centavos":50000,"dias_por_bloco":30,"minimo_dias_para_bloco":21,"antecedencia_dias":2}'),
  ('super-destaque', 'Super Destaque',
   'Uma vaga no carrossel do topo de todas as páginas do site. São no máximo 8 vagas, e a ordem é sorteada a cada visita.',
   null, 8990, 'mensal', true, '{"vagas":8,"ordem":"sorteio_a_cada_visita"}'),
  ('link-patrocinado', 'Link patrocinado nos bairros',
   'Uma das 3 primeiras posições da lista da sua categoria, quando o visitante escolhe um dos 3 bairros do pacote. Com mais de 3 patrocinados, há sorteio a cada busca. Você continua também na sua posição normal da lista.',
   'por categoria, em 3 bairros', 3990, 'mensal', true,
   '{"peso_sorteio":1,"abrangencia":"bairros","bairros_por_pacote":3}'),
  ('patrocinado-plus', 'Patrocinado Plus nos bairros',
   'Igual ao link patrocinado nos bairros, com o dobro de chance no sorteio.',
   'por categoria, em 3 bairros', 5990, 'mensal', true,
   '{"peso_sorteio":2,"abrangencia":"bairros","bairros_por_pacote":3}'),
  ('link-patrocinado-cidade', 'Link patrocinado na cidade toda',
   'Uma das 3 primeiras posições da lista da sua categoria em todas as buscas, com ou sem bairro escolhido. No máximo 3 por categoria. Você continua também na sua posição normal da lista.',
   'por categoria', 7990, 'mensal', true,
   '{"peso_sorteio":1,"abrangencia":"cidade","limite_por_categoria":3}'),
  ('categoria-adicional', 'Categoria adicional', 'Apareça em mais 1 categoria, além das incluídas no plano.',
   'por categoria', 190, 'mensal', true, '{}'),
  ('pacote-fotos', 'Pacote de fotos', 'Mais 10 fotos, além das incluídas no plano.', null, 490, 'mensal', true, '{}'),
  ('encarte-adicional', 'Encarte adicional',
   'Mais 1 encarte de ofertas por semana, além dos incluídos no plano. Para comércios.', null, 490, 'mensal', true, '{}'),
  ('pacote-produtos', 'Pacote de produtos',
   'Mais 50 produtos na vitrine, além dos incluídos no plano. Para comércios.', null, 1490, 'mensal', true, '{}'),
  ('endereco-adicional', 'Endereço adicional',
   'Mais 1 loja na mesma cidade, com endereço e horário próprios. Para comércios.', null, 990, 'mensal', true, '{}');

update public.extras e
set nome = n.nome,
    descricao = n.descricao,
    unidade = n.unidade,
    valor_mensal_centavos = n.valor_mensal_centavos,
    cobranca = n.cobranca,
    permite_anual = n.permite_anual,
    regras = n.regras
from extras_novos n
where e.codigo = n.codigo
  and e.cidade_id = (select id from public.cidades where slug = 'rio-das-ostras');

insert into public.extras (cidade_id, codigo, nome, descricao, unidade, valor_mensal_centavos, cobranca,
                           aceita_desconto_fundador, permite_anual, regras)
select (select id from public.cidades where slug = 'rio-das-ostras'), n.codigo, n.nome, n.descricao, n.unidade,
       n.valor_mensal_centavos, n.cobranca, false, n.permite_anual, n.regras
from extras_novos n
where n.codigo = 'link-patrocinado-cidade';

-- Conferência: os 10 extras precisam existir depois desta migration.
do $$
begin
  if (select count(*) from public.extras e join extras_novos n using (codigo)) <> 10 then
    raise exception 'Extras esperados não encontrados: a migration não foi aplicada por inteiro.';
  end if;
end;
$$;

drop table extras_novos;

-- Chave Pix mostrada na área do anunciante (item 4.15). É o CNPJ da empresa,
-- dado público; a tabela configuracoes só é lida pela administração (RLS).
insert into public.configuracoes (cidade_id, chave, valor)
values ((select id from public.cidades where slug = 'rio-das-ostras'), 'chave_pix',
        '{"tipo":"cnpj","chave":"37905181000105"}'::jsonb);
