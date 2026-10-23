-- Comércios em espera (decisão de 23/10/2026): os importados da Receita cujo
-- bairro não bate com a tabela de bairros ficam guardados aqui, fora do site.
-- Quando a administração liga o nome da Receita a um bairro (ou cria o bairro),
-- o gatilho publica na hora os comércios em espera daquele nome, no plano
-- Gratuito, sem coordenada (o "Como chegar" usa o endereço escrito; a próxima
-- rodada do script preenche o mapa). "Deixar de fora" mantém a espera.

create table public.comercios_em_espera (
  cnpj text primary key check (cnpj ~ '^[0-9]{14}$'),
  cidade_id uuid not null references public.cidades (id),
  -- Nome do bairro como veio na Receita, normalizado (chave de apelidos_bairro).
  nome_receita text not null check (length(nome_receita) between 1 and 100),
  nome text not null check (length(trim(nome)) between 2 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  categoria_id uuid not null,
  logradouro text not null check (length(trim(logradouro)) between 2 and 120),
  numero text not null check (length(numero) between 1 and 10),
  complemento text check (length(complemento) <= 60),
  -- Os mesmos campos de dados_receita (só a equipe vê).
  receita jsonb not null check (jsonb_typeof(receita) = 'object'),
  referencia text not null check (referencia ~ '^[0-9]{4}-[0-9]{2}$'),
  criado_em timestamptz not null default now(),
  foreign key (categoria_id, cidade_id) references public.categorias (id, cidade_id)
);
create index comercios_em_espera_nome_idx on public.comercios_em_espera (cidade_id, nome_receita);

alter table public.comercios_em_espera enable row level security;
create policy "visitante sem acesso" on public.comercios_em_espera as restrictive for all to anon using (false) with check (false);
create policy "administrador lê e altera" on public.comercios_em_espera
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

/**
 * Publica os comércios em espera de um nome da Receita no bairro escolhido.
 * Pula CNPJ bloqueado ou já importado. Slug único na cidade: o do comércio; se
 * repetir, com o bairro; depois um número.
 */
create function interno.publicar_em_espera(p_cidade uuid, p_nome_receita text, p_bairro uuid) returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  c public.comercios_em_espera;
  plano uuid;
  bairro_slug text;
  slug_final text;
  n integer;
  novo uuid;
  publicados integer := 0;
begin
  select id into plano from public.planos where cidade_id = p_cidade and codigo = 'com-gratuito';
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
$$;

revoke execute on function interno.publicar_em_espera(uuid, text, uuid) from public, anon, authenticated;

create function interno.ao_resolver_apelido() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.bairro_id is not null and new.bairro_id is distinct from old.bairro_id then
    perform interno.publicar_em_espera(new.cidade_id, new.nome_receita, new.bairro_id);
    -- Os comércios saíram da espera: o nome deixa de contar como pendente.
    new.comercios := 0;
    new.exemplos := '[]'::jsonb;
  end if;
  return new;
end
$$;

create trigger publicar_em_espera before update on public.apelidos_bairro
for each row execute function interno.ao_resolver_apelido();
