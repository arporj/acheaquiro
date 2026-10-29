-- Novos nomes de planos e extras (decisão de 29/10/2026). Os códigos passam a
-- dizer o nível, e não o nome, para o nome poder mudar sem quebrar referência:
-- prof-nivel1 a prof-nivel4 e com-nivel1 a com-nivel4. O nome exibido fica só
-- em planos.nome. O Destaque Exclusivo vira Banner Exclusivo, o Super Destaque
-- vira Carrossel e o Destacado Plus deixa de existir (sem peso dobrado no
-- sorteio dos links destacados).

-- O Destacado Plus só sai se nada além do histórico de preços apontar para ele.
-- (Ainda não existe contratação de extras: ela entra no 3B.2.)
do $$
declare
  referencias text;
begin
  select string_agg(c.conrelid::regclass::text, ', ') into referencias
  from pg_constraint c
  where c.confrelid = 'public.extras'::regclass and c.conrelid <> 'public.historico_precos'::regclass;
  if referencias is not null then
    raise exception 'Destacado Plus: há tabelas que apontam para extras (%); conferir contratações antes de apagar.', referencias;
  end if;
end
$$;

update public.planos p
set codigo = n.codigo_novo,
    nome = n.nome
from (values
  ('prof-basico', 'prof-nivel1', 'Inicial'),
  ('prof-profissional', 'prof-nivel2', 'Essencial'),
  ('prof-premium', 'prof-nivel3', 'Avançado'),
  ('prof-superpremium', 'prof-nivel4', 'Premium'),
  ('com-gratuito', 'com-nivel1', 'Gratuito'),
  ('com-basico', 'com-nivel2', 'Essencial'),
  ('com-vitrine', 'com-nivel3', 'Avançado'),
  ('com-premium', 'com-nivel4', 'Premium')
) as n (codigo_antigo, codigo_novo, nome)
where p.codigo = n.codigo_antigo;

update public.extras e
set codigo = n.codigo_novo,
    nome = n.nome
from (values
  ('destaque-exclusivo', 'banner-exclusivo', 'Banner Exclusivo'),
  ('super-destaque', 'carrossel', 'Carrossel')
) as n (codigo_antigo, codigo_novo, nome)
where e.codigo = n.codigo_antigo;

-- Apaga junto a linha do histórico de preços (on delete cascade); a auditoria registra.
delete from public.extras where codigo = 'destacado-plus';

-- Todos os links destacados têm a mesma chance no sorteio do topo.
update public.extras
set regras = regras - 'peso_sorteio'
where codigo in ('link-destacado', 'link-destacado-cidade');

-- Comércio que sai da espera entra no plano de nível 1 (Gratuito).
create or replace function interno.publicar_em_espera(p_cidade uuid, p_nome_receita text, p_bairro uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.comercios_em_espera;
  plano uuid;
  bairro_slug text;
  slug_final text;
  n integer;
  novo uuid;
  publicados integer := 0;
begin
  select id into plano from public.planos where cidade_id = p_cidade and codigo = 'com-nivel1';
  select slug into bairro_slug from public.bairros where id = p_bairro;
  for c in
    select * from public.comercios_em_espera where cidade_id = p_cidade and nome_receita = p_nome_receita order by nome
  loop
    if exists (select 1 from public.cnpjs_bloqueados b where b.cidade_id = p_cidade and b.cnpj = c.cnpj)
       or exists (select 1 from public.dados_receita d where d.cnpj = c.cnpj) then
      delete from public.comercios_em_espera where cnpj = c.cnpj;
      continue;
    end if;

    slug_final := c.slug;
    if exists (select 1 from public.anunciantes a where a.cidade_id = p_cidade and a.slug = slug_final) then
      slug_final := left(c.slug || '-' || bairro_slug, 80);
      n := 2;
      while exists (select 1 from public.anunciantes a where a.cidade_id = p_cidade and a.slug = slug_final) loop
        slug_final := left(c.slug || '-' || bairro_slug, 75) || '-' || n;
        n := n + 1;
      end loop;
    end if;

    insert into public.anunciantes (cidade_id, tipo, slug, nome, status, origem, plano_id, categoria_principal_id, aprovado_em)
    values (p_cidade, 'comercio', slug_final, c.nome, 'publicado', 'receita', plano, c.categoria_id, now())
    returning id into novo;
    insert into public.enderecos (anunciante_id, cidade_id, logradouro, numero, complemento, bairro_id, principal)
    values (novo, p_cidade, c.logradouro, c.numero, c.complemento, p_bairro, true);
    insert into public.dados_receita (
      anunciante_id, cidade_id, cnpj, razao_social, nome_fantasia, telefones, email,
      cnae_principal, cnaes_secundarios, abertura, bairro_receita, referencia
    ) values (
      novo, p_cidade, c.cnpj, c.receita ->> 'razao_social', c.receita ->> 'nome_fantasia',
      coalesce(array(select jsonb_array_elements_text(c.receita -> 'telefones')), '{}'), c.receita ->> 'email',
      c.receita ->> 'cnae_principal', coalesce(array(select jsonb_array_elements_text(c.receita -> 'cnaes_secundarios')), '{}'),
      (c.receita ->> 'abertura')::date, c.receita ->> 'bairro_receita', c.referencia
    );
    delete from public.comercios_em_espera where cnpj = c.cnpj;
    publicados := publicados + 1;
  end loop;
  return publicados;
end
$function$;

-- Conferência: nenhum código antigo sobra no banco, nem em funções.
do $$
begin
  if exists (select 1 from public.planos where codigo !~ '^(prof|com)-nivel[1-9]$') then
    raise exception 'Sobrou plano com código antigo.';
  end if;
  if exists (select 1 from public.extras where codigo in ('destaque-exclusivo', 'super-destaque', 'destacado-plus')) then
    raise exception 'Sobrou extra com código antigo.';
  end if;
  if exists (select 1 from public.extras where regras ? 'peso_sorteio') then
    raise exception 'Sobrou peso de sorteio nos links destacados.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname in ('public', 'interno')
      and p.prosrc ~ '(prof|com)-(basico|profissional|premium|superpremium|gratuito|vitrine)\M|destaque-exclusivo|super-destaque|destacado-plus'
  ) then
    raise exception 'Sobrou código antigo numa função do banco.';
  end if;
end
$$;
