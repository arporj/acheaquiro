-- Catálogo ampliado para a importação dos comércios pelo CNPJ (decisão de 22/10/2026):
-- o grupo "Comércios" é dividido, entram os grupos Esporte e academias, Turismo e
-- hospedagem, Serviços profissionais, Religião e espiritualidade e as categorias
-- pedidas pela equipe. Cada grupo tem uma vaga na cota de patrocínio de grupo.

-- Grupos novos e nova ordem (18 grupos).
insert into public.grupos_categoria (cidade_id, nome, ordem)
select c.id, v.nome, v.ordem
from public.cidades c
cross join (values
  ('Comer e beber', 1),
  ('Mercados e alimentos', 2),
  ('Lojas', 3),
  ('Construção e reforma', 5),
  ('Esporte e academias', 8),
  ('Turismo e hospedagem', 15),
  ('Serviços profissionais', 16),
  ('Religião e espiritualidade', 17)
) as v (nome, ordem)
where c.slug = 'rio-das-ostras';

update public.grupos_categoria g set ordem = v.ordem
from public.cidades c, (values
  ('Serviços para casa', 4),
  ('Limpeza e cuidados com a casa', 6),
  ('Beleza e bem-estar', 7),
  ('Saúde', 9),
  ('Educação', 10),
  ('Pessoas e família', 11),
  ('Pets', 12),
  ('Eventos e comida', 13),
  ('Veículos', 14),
  ('Outros serviços', 18)
) as v (nome, ordem)
where c.slug = 'rio-das-ostras' and g.cidade_id = c.id and g.nome = v.nome;

-- Categorias que mudam de grupo.
update public.categorias cat set grupo_id = g.id
from public.cidades c, public.grupos_categoria g, (values
  ('restaurantes', 'Comer e beber'),
  ('lanchonetes', 'Comer e beber'),
  ('pizzarias', 'Comer e beber'),
  ('padarias', 'Comer e beber'),
  ('mercados', 'Mercados e alimentos'),
  ('hortifrutis', 'Mercados e alimentos'),
  ('acougues', 'Mercados e alimentos'),
  ('lojas-de-roupas', 'Lojas'),
  ('oticas', 'Lojas'),
  ('papelarias', 'Lojas'),
  ('farmacias', 'Lojas'),
  ('lojas-de-descartaveis', 'Lojas'),
  ('graficas', 'Lojas'),
  ('lojas-de-material-de-construcao', 'Construção e reforma'),
  ('lojas-de-ferragens', 'Construção e reforma'),
  ('lojas-de-tintas', 'Construção e reforma'),
  ('pousadas', 'Turismo e hospedagem'),
  ('agropecuarias', 'Pets'),
  ('pet-shops', 'Pets'),
  ('hortos', 'Limpeza e cuidados com a casa'),
  ('advogados', 'Serviços profissionais'),
  ('personal-trainers', 'Esporte e academias'),
  ('cartomantes', 'Religião e espiritualidade')
) as v (slug, grupo)
where c.slug = 'rio-das-ostras' and cat.cidade_id = c.id and cat.slug_lista = v.slug
  and g.cidade_id = c.id and g.nome = v.grupo;

-- Categorias renomeadas (o site ainda não abriu, então o link curto pode mudar).
update public.categorias cat set nome = v.nome, nome_plural = v.plural, slug_lista = v.novo_slug
from public.cidades c, (values
  ('cabeleireiros', 'Salão de beleza', 'Salões de beleza', 'saloes-de-beleza'),
  ('barbeiros', 'Barbearia', 'Barbearias', 'barbearias'),
  ('motoristas-particulares', 'Motorista particular e por aplicativo', 'Motoristas particulares e por aplicativo', 'motoristas'),
  ('cartomantes', 'Místico e esotérico', 'Místicos e esotéricos', 'misticos-e-esotericos')
) as v (slug, nome, plural, novo_slug)
where c.slug = 'rio-das-ostras' and cat.cidade_id = c.id and cat.slug_lista = v.slug;

delete from public.grupos_categoria g
using public.cidades c
where c.slug = 'rio-das-ostras' and g.cidade_id = c.id and g.nome = 'Comércios';

-- Categorias novas. Tipo "comercio" para loja e estabelecimento; "ambos" para serviço.
insert into public.categorias (cidade_id, grupo_id, tipo, nome, nome_plural, slug_lista, icone, cor)
select c.id, g.id, v.tipo::public.tipo_categoria, v.nome, v.plural, v.slug, v.icone, v.cor
from public.cidades c
join public.grupos_categoria g on g.cidade_id = c.id
join (values
  -- Comer e beber
  ('Comer e beber', 'comercio', 'Bar', 'Bares', 'bares', 'beer', '#F57C00'),
  ('Comer e beber', 'comercio', 'Doceria e confeitaria', 'Docerias e confeitarias', 'docerias', 'cake-slice', '#E0559E'),
  ('Comer e beber', 'comercio', 'Sorveteria e açaí', 'Sorveterias e açaí', 'sorveterias', 'ice-cream-cone', '#7E3FC4'),
  ('Comer e beber', 'comercio', 'Pastelaria', 'Pastelarias', 'pastelarias', 'utensils', '#F2A900'),
  ('Comer e beber', 'comercio', 'Cafeteria', 'Cafeterias', 'cafeterias', 'coffee', '#9A5B2E'),
  -- Mercados e alimentos
  ('Mercados e alimentos', 'comercio', 'Peixaria', 'Peixarias', 'peixarias', 'fish', '#1E9BE0'),
  ('Mercados e alimentos', 'comercio', 'Depósito de bebidas', 'Depósitos de bebidas', 'depositos-de-bebidas', 'wine', '#A2264A'),
  -- Lojas
  ('Lojas', 'comercio', 'Calçados', 'Lojas de calçados', 'calcados', 'footprints', '#9A5B2E'),
  ('Lojas', 'comercio', 'Cosméticos e perfumaria', 'Cosméticos e perfumarias', 'cosmeticos-e-perfumaria', 'sparkles', '#D81B7A'),
  ('Lojas', 'comercio', 'Joias e bijuterias', 'Joias e bijuterias', 'joias-e-bijuterias', 'gem', '#7E3FC4'),
  ('Lojas', 'comercio', 'Celulares e acessórios', 'Celulares e acessórios', 'celulares', 'smartphone', '#2563EB'),
  ('Lojas', 'comercio', 'Informática', 'Lojas de informática', 'informatica', 'monitor', '#475569'),
  ('Lojas', 'comercio', 'Móveis e colchões', 'Móveis e colchões', 'moveis-e-colchoes', 'sofa', '#9A5B2E'),
  ('Lojas', 'comercio', 'Eletrodomésticos', 'Lojas de eletrodomésticos', 'eletrodomesticos', 'refrigerator', '#1E9BE0'),
  ('Lojas', 'comercio', 'Cama, mesa e banho', 'Cama, mesa e banho', 'cama-mesa-e-banho', 'bed-double', '#0E9F94'),
  ('Lojas', 'comercio', 'Armarinho e tecidos', 'Armarinhos e tecidos', 'armarinhos-e-tecidos', 'spool', '#E0559E'),
  ('Lojas', 'comercio', 'Bicicletas', 'Lojas de bicicletas', 'bicicletas', 'bike', '#1E9E4A'),
  ('Lojas', 'comercio', 'Esporte, pesca e camping', 'Esporte, pesca e camping', 'esporte-pesca-e-camping', 'tent', '#1E9E4A'),
  ('Lojas', 'comercio', 'Brinquedos', 'Lojas de brinquedos', 'brinquedos', 'blocks', '#F57C00'),
  ('Lojas', 'comercio', 'Floricultura', 'Floriculturas', 'floriculturas', 'flower', '#E0559E'),
  ('Lojas', 'comercio', 'Loja de variedades', 'Lojas de variedades', 'lojas-de-variedades', 'store', '#2563EB'),
  ('Lojas', 'comercio', 'Gás de cozinha', 'Gás de cozinha', 'gas-de-cozinha', 'flame', '#E53935'),
  ('Lojas', 'comercio', 'Tabacaria e charutaria', 'Tabacarias e charutarias', 'tabacarias', 'cigarette', '#475569'),
  ('Lojas', 'comercio', 'Livraria', 'Livrarias', 'livrarias', 'book', '#A2264A'),
  ('Lojas', 'comercio', 'Presentes e artesanato', 'Lojas de presentes e artesanato', 'presentes', 'gift', '#D81B7A'),
  ('Lojas', 'comercio', 'Instrumentos musicais e som', 'Instrumentos musicais e som', 'instrumentos-musicais', 'guitar', '#7E3FC4'),
  -- Construção e reforma
  ('Construção e reforma', 'comercio', 'Material elétrico e hidráulico', 'Material elétrico e hidráulico', 'material-eletrico-e-hidraulico', 'plug', '#F2A900'),
  ('Construção e reforma', 'comercio', 'Marmoraria', 'Marmorarias', 'marmorarias', 'layers', '#475569'),
  ('Construção e reforma', 'comercio', 'Madeireira', 'Madeireiras', 'madeireiras', 'tree-pine', '#9A5B2E'),
  ('Construção e reforma', 'ambos', 'Construtora', 'Construtoras', 'construtoras', 'building', '#475569'),
  ('Construção e reforma', 'ambos', 'Aluguel de equipamentos e caçambas', 'Aluguel de equipamentos e caçambas', 'aluguel-de-equipamentos', 'container', '#F57C00'),
  ('Construção e reforma', 'ambos', 'Energia solar', 'Energia solar', 'energia-solar', 'sun', '#F2A900'),
  -- Esporte e academias
  ('Esporte e academias', 'ambos', 'Academia', 'Academias', 'academias', 'dumbbell', '#E53935'),
  ('Esporte e academias', 'ambos', 'Pilates', 'Pilates', 'pilates', 'activity', '#0E9F94'),
  ('Esporte e academias', 'ambos', 'Estúdio de dança', 'Estúdios de dança', 'estudios-de-danca', 'music', '#D81B7A'),
  ('Esporte e academias', 'ambos', 'Escola de esportes', 'Escolas de esportes', 'escolas-de-esportes', 'trophy', '#1E9E4A'),
  -- Saúde
  ('Saúde', 'ambos', 'Psicólogo(a)', 'Psicólogos', 'psicologos', 'brain', '#7E3FC4'),
  ('Saúde', 'ambos', 'Fisioterapia', 'Fisioterapia', 'fisioterapia', 'activity', '#1E9BE0'),
  ('Saúde', 'ambos', 'Nutricionista', 'Nutricionistas', 'nutricionistas', 'apple', '#1E9E4A'),
  ('Saúde', 'ambos', 'Fonoaudiólogo(a)', 'Fonoaudiólogos', 'fonoaudiologos', 'ear', '#0E9F94'),
  ('Saúde', 'comercio', 'Laboratório e exames', 'Laboratórios e exames', 'laboratorios', 'flask-conical', '#2563EB'),
  ('Saúde', 'ambos', 'Home care', 'Home care', 'home-care', 'house-plus', '#E53935'),
  ('Saúde', 'comercio', 'Casa de repouso', 'Casas de repouso', 'casas-de-repouso', 'hand-heart', '#A2264A'),
  -- Educação
  ('Educação', 'comercio', 'Creche', 'Creches', 'creches', 'baby', '#F2A900'),
  ('Educação', 'ambos', 'Escola de música', 'Escolas de música', 'escolas-de-musica', 'music', '#7E3FC4'),
  ('Educação', 'ambos', 'Curso preparatório', 'Cursos preparatórios', 'cursos-preparatorios', 'book-open', '#2563EB'),
  -- Pets
  ('Pets', 'ambos', 'Hotel para cães', 'Hotéis para cães', 'hoteis-para-caes', 'dog', '#F57C00'),
  -- Eventos e comida
  ('Eventos e comida', 'comercio', 'Casa de festas', 'Casas de festas', 'casas-de-festas', 'party-popper', '#D81B7A'),
  ('Eventos e comida', 'ambos', 'Organização de eventos', 'Organização de eventos', 'organizacao-de-eventos', 'calendar', '#7E3FC4'),
  ('Eventos e comida', 'ambos', 'Aluguel para festas', 'Aluguel para festas', 'aluguel-para-festas', 'armchair', '#F57C00'),
  -- Veículos
  ('Veículos', 'comercio', 'Autopeças', 'Autopeças', 'autopecas', 'cog', '#475569'),
  ('Veículos', 'comercio', 'Revenda de veículos', 'Revendas de veículos', 'revendas-de-veiculos', 'car-front', '#2563EB'),
  ('Veículos', 'ambos', 'Funilaria e pintura', 'Funilaria e pintura', 'funilaria-e-pintura', 'paint-bucket', '#E53935'),
  ('Veículos', 'comercio', 'Posto de combustível', 'Postos de combustível', 'postos-de-combustivel', 'fuel', '#F57C00'),
  ('Veículos', 'ambos', 'Oficina de motos', 'Oficinas de motos', 'oficinas-de-motos', 'bike', '#475569'),
  ('Veículos', 'comercio', 'Estacionamento', 'Estacionamentos', 'estacionamentos', 'square-parking', '#2563EB'),
  ('Veículos', 'comercio', 'Locadora de veículos', 'Locadoras de veículos', 'locadoras-de-veiculos', 'car', '#0E9F94'),
  ('Veículos', 'comercio', 'Autoescola', 'Autoescolas', 'autoescolas', 'car-front', '#F2A900'),
  ('Veículos', 'ambos', 'Reboque', 'Reboques', 'reboques', 'truck', '#E53935'),
  -- Turismo e hospedagem
  ('Turismo e hospedagem', 'comercio', 'Hotel', 'Hotéis', 'hoteis', 'hotel', '#2563EB'),
  ('Turismo e hospedagem', 'comercio', 'Agência de viagens', 'Agências de viagens', 'agencias-de-viagens', 'plane', '#1E9BE0'),
  ('Turismo e hospedagem', 'ambos', 'Passeio de barco', 'Passeios de barco', 'passeios-de-barco', 'sailboat', '#0E9F94'),
  ('Turismo e hospedagem', 'ambos', 'Mergulho', 'Mergulho', 'mergulho', 'anchor', '#2563EB'),
  ('Turismo e hospedagem', 'ambos', 'Náutica: barcos e jet ski', 'Náutica: barcos e jet ski', 'nautica', 'ship', '#1E9BE0'),
  -- Serviços profissionais
  ('Serviços profissionais', 'ambos', 'Contabilidade', 'Contabilidade', 'contabilidade', 'calculator', '#475569'),
  ('Serviços profissionais', 'ambos', 'Imobiliária', 'Imobiliárias', 'imobiliarias', 'key-round', '#2563EB'),
  ('Serviços profissionais', 'ambos', 'Corretor de seguros', 'Corretores de seguros', 'corretores-de-seguros', 'shield-check', '#0E9F94'),
  ('Serviços profissionais', 'ambos', 'Engenharia e arquitetura', 'Engenharia e arquitetura', 'engenharia-e-arquitetura', 'drafting-compass', '#475569'),
  ('Serviços profissionais', 'ambos', 'Consultoria empresarial', 'Consultoria empresarial', 'consultoria-empresarial', 'briefcase', '#A2264A'),
  ('Serviços profissionais', 'ambos', 'Publicidade e marketing', 'Publicidade e marketing', 'publicidade-e-marketing', 'megaphone', '#D81B7A'),
  ('Serviços profissionais', 'comercio', 'Cartório', 'Cartórios', 'cartorios', 'stamp', '#475569'),
  ('Serviços profissionais', 'comercio', 'Lotérica', 'Lotéricas', 'lotericas', 'ticket', '#1E9E4A'),
  ('Serviços profissionais', 'ambos', 'Serviços offshore', 'Serviços offshore', 'offshore', 'ship', '#2563EB'),
  -- Religião e espiritualidade
  ('Religião e espiritualidade', 'comercio', 'Igreja', 'Igrejas', 'igrejas', 'church', '#7E3FC4'),
  ('Religião e espiritualidade', 'comercio', 'Centro espírita', 'Centros espíritas', 'centros-espiritas', 'heart', '#1E9BE0'),
  ('Religião e espiritualidade', 'comercio', 'Ordem e fraternidade', 'Ordens e fraternidades', 'ordens-e-fraternidades', 'compass', '#475569'),
  ('Religião e espiritualidade', 'ambos', 'Terapias holísticas', 'Terapias holísticas', 'terapias-holisticas', 'leaf', '#1E9E4A'),
  -- Outros serviços
  ('Outros serviços', 'comercio', 'Lavanderia', 'Lavanderias', 'lavanderias', 'washing-machine', '#1E9BE0'),
  ('Outros serviços', 'comercio', 'Funerária', 'Funerárias', 'funerarias', 'flower-2', '#475569'),
  ('Outros serviços', 'ambos', 'Costureira', 'Costureiras', 'costureiras', 'scissors', '#E0559E'),
  ('Outros serviços', 'ambos', 'Sapateiro', 'Sapateiros', 'sapateiros', 'footprints', '#9A5B2E'),
  ('Outros serviços', 'ambos', 'Segurança eletrônica', 'Segurança eletrônica', 'seguranca-eletronica', 'cctv', '#475569'),
  ('Outros serviços', 'ambos', 'Mudanças e fretes', 'Mudanças e fretes', 'mudancas-e-fretes', 'truck', '#F57C00'),
  ('Outros serviços', 'ambos', 'Empresa de limpeza', 'Empresas de limpeza', 'empresas-de-limpeza', 'spray-can', '#0E9F94'),
  ('Outros serviços', 'ambos', 'Assistência técnica de informática e celular', 'Assistência técnica de informática e celular', 'assistencia-tecnica', 'laptop', '#2563EB'),
  ('Outros serviços', 'ambos', 'Tornearia e solda', 'Tornearia e solda', 'tornearia-e-solda', 'cog', '#475569'),
  ('Outros serviços', 'ambos', 'Poço artesiano', 'Poços artesianos', 'pocos-artesianos', 'droplets', '#1E9BE0'),
  ('Outros serviços', 'ambos', 'Reciclagem', 'Reciclagem', 'reciclagem', 'recycle', '#1E9E4A'),
  ('Outros serviços', 'ambos', 'ONG e projeto social', 'ONGs e projetos sociais', 'ongs', 'hand-heart', '#E53935')
) as v (grupo, tipo, nome, plural, slug, icone, cor) on g.nome = v.grupo
where c.slug = 'rio-das-ostras';

-- Sinônimos para a busca encontrar pelo nome que o visitante digita.
insert into public.sinonimos_categoria (categoria_id, termo)
select cat.id, v.termo
from public.cidades c
join public.categorias cat on cat.cidade_id = c.id
join (values
  ('saloes-de-beleza', 'cabeleireiro'),
  ('saloes-de-beleza', 'cabeleireira'),
  ('saloes-de-beleza', 'corte de cabelo'),
  ('barbearias', 'barbeiro'),
  ('barbearias', 'barba'),
  ('motoristas', 'uber'),
  ('motoristas', 'motorista de aplicativo'),
  ('misticos-e-esotericos', 'cartomante'),
  ('misticos-e-esotericos', 'tarô'),
  ('centros-espiritas', 'kardecista'),
  ('centros-espiritas', 'espiritismo'),
  ('ordens-e-fraternidades', 'maçonaria'),
  ('ordens-e-fraternidades', 'rosa cruz'),
  ('estudios-de-danca', 'dança'),
  ('estudios-de-danca', 'pole dance'),
  ('academias', 'treino funcional'),
  ('academias', 'crossfit'),
  ('tabacarias', 'charutaria'),
  ('tabacarias', 'charuto'),
  ('depositos-de-bebidas', 'depósito'),
  ('depositos-de-bebidas', 'distribuidora de bebidas'),
  ('contabilidade', 'contador'),
  ('engenharia-e-arquitetura', 'arquiteto'),
  ('engenharia-e-arquitetura', 'engenheiro'),
  ('assistencia-tecnica', 'manutenção de computador'),
  ('assistencia-tecnica', 'conserto de celular'),
  ('nautica', 'jet ski'),
  ('nautica', 'lancha'),
  ('cosmeticos-e-perfumaria', 'perfumaria'),
  ('locadoras-de-veiculos', 'aluguel de carros'),
  ('aluguel-de-equipamentos', 'aluguel de máquinas'),
  ('gas-de-cozinha', 'botijão'),
  ('psicologos', 'psicologia'),
  ('nutricionistas', 'nutrição'),
  ('ongs', 'ong'),
  ('ongs', 'projeto social')
) as v (slug, termo) on cat.slug_lista = v.slug
where c.slug = 'rio-das-ostras'
on conflict (categoria_id, termo_normalizado) do nothing;
