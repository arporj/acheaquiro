-- Benefícios das cotas de patrocínio no Instagram (decisão de 29/10/2026), no
-- lugar dos posts por mês. Master: post fixado no perfil durante os 12 meses,
-- 1 reel e 1 story por mês e o destaque "Patrocinadores"; Ouro: 1 post no feed
-- e 1 story por mês e o destaque; Grupo de categorias e Agenda: post de
-- boas-vindas, 1 story por mês e o destaque; Apoio e Categoria: post de
-- boas-vindas e o destaque. Cartazes, panfletos e carro de som, só "quando
-- houver". Os textos continuam editáveis em /admin/patrocinadores.

update public.cotas_patrocinio c
set beneficios = n.beneficios
from (values
  ('master', array[
    'Logo maior no rodapé de todas as páginas',
    'Post fixado no perfil do Instagram do Ache Aqui RO durante os 12 meses',
    '1 reel e 1 story por mês no Instagram',
    'Presença no destaque "Patrocinadores" do perfil no Instagram',
    'Logo nos cartazes e panfletos, quando houver',
    'Carro de som, quando houver'
  ]),
  ('ouro', array[
    'Logo médio no rodapé de todas as páginas',
    '1 post no feed e 1 story por mês no Instagram',
    'Presença no destaque "Patrocinadores" do perfil no Instagram',
    'Logo nos cartazes e panfletos, quando houver'
  ]),
  ('grupo', array[
    'Nome ao lado do grupo, em todas as categorias dele (exemplo: Comércios)',
    '1 post de boas-vindas e 1 story por mês no Instagram',
    'Presença no destaque "Patrocinadores" do perfil no Instagram'
  ]),
  ('agenda', array[
    'Nome ao lado do título da Agenda de shows e eventos',
    '1 post de boas-vindas e 1 story por mês no Instagram',
    'Presença no destaque "Patrocinadores" do perfil no Instagram'
  ]),
  ('apoio', array[
    'Logo pequeno no rodapé de todas as páginas',
    '1 post de boas-vindas no Instagram',
    'Presença no destaque "Patrocinadores" do perfil no Instagram'
  ]),
  ('categoria', array[
    'Nome ao lado do título da categoria (exemplo: Pizzarias)',
    '1 post de boas-vindas no Instagram',
    'Presença no destaque "Patrocinadores" do perfil no Instagram'
  ])
) as n(cota, beneficios)
where c.cota = n.cota::public.cota_patrocinio;

-- Nenhuma cota pode ficar com o texto antigo.
do $$
begin
  if exists (select 1 from public.cotas_patrocinio where array_to_string(beneficios, ' ') ~* 'posts? por mês') then
    raise exception 'Benefícios: alguma cota ainda fala em posts por mês.';
  end if;
end
$$;
