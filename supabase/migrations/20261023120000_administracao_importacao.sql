-- Administração da importação pela Receita (D5, decisões de 23/10/2026):
-- - pedido de "remover" ou "fechou" confirmado apaga o perfil (LGPD) e bloqueia
--   o CNPJ, para a próxima importação não trazer o comércio de volta;
-- - o pedido continua no histórico depois que o perfil sai (CNPJ e nome guardados);
-- - os apelidos de bairro saem do arquivo do script e vão para o banco, onde a
--   administração liga o nome escrito na Receita a um bairro, cria um bairro
--   novo ou deixa de fora;
-- - "assumir" confirmado manda o convite e liga a conta ao perfil (no servidor).

create table public.cnpjs_bloqueados (
  cidade_id uuid not null references public.cidades (id),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  motivo text not null check (motivo in ('remover', 'fechou')),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (cidade_id, cnpj)
);

create table public.apelidos_bairro (
  cidade_id uuid not null references public.cidades (id),
  -- Nome escrito na Receita, já normalizado (sem acento, minúsculo).
  nome_receita text not null check (length(nome_receita) between 1 and 100),
  -- Vazio e sem "ignorar": pendente, à espera da administração.
  bairro_id uuid,
  ignorar boolean not null default false,
  -- Comércios com este nome na última preparação da importação.
  comercios integer not null default 0 check (comercios >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (cidade_id, nome_receita),
  foreign key (bairro_id, cidade_id) references public.bairros (id, cidade_id),
  check (not (ignorar and bairro_id is not null))
);

insert into public.apelidos_bairro (cidade_id, nome_receita, bairro_id)
select c.id, v.nome_receita, b.id
from public.cidades c
cross join (values
  ('res praia ancora', 'Residencial Praia Âncora'),
  ('res. praia ancora', 'Residencial Praia Âncora'),
  ('praia ancora', 'Residencial Praia Âncora'),
  ('ancora', 'Residencial Praia Âncora'),
  ('bairro ancora', 'Residencial Praia Âncora'),
  ('residencial ancora', 'Residencial Praia Âncora'),
  ('costa azul', 'Costazul'),
  ('centro -costa azul', 'Costazul'),
  ('recreio r das ostras', 'Recreio'),
  ('recreio rio das ostras', 'Recreio'),
  ('recreio rio das osras', 'Recreio'),
  ('recreio de r. ostras', 'Recreio'),
  ('recreio r. das ostras', 'Recreio'),
  ('recanto r das ostras', 'Recanto'),
  ('recanto rio das ostras', 'Recanto'),
  ('recanto de rio das ostras', 'Recanto'),
  ('alphaville r das ostras', 'Alphaville'),
  ('ext do serramar', 'Loteamento Extensão do Serramar'),
  ('extensao serramar', 'Loteamento Extensão do Serramar'),
  ('extensao do serramar', 'Loteamento Extensão do Serramar'),
  ('extenso serramar', 'Loteamento Extensão do Serramar'),
  ('extencao serra mar', 'Loteamento Extensão do Serramar'),
  ('extencao do serramar', 'Loteamento Extensão do Serramar'),
  ('extensao serra mar', 'Loteamento Extensão do Serramar'),
  ('serra mar', 'Serramar'),
  ('zen', 'Zona Zen'),
  ('zona especial de negocios', 'Zona Zen'),
  ('zona especial de negocios - zen', 'Zona Zen'),
  ('res maria turri', 'Maria Turri'),
  ('loteamento residencial maria turri', 'Maria Turri'),
  ('res verdes mares', 'Verdes Mares'),
  ('loteam.verdes mares', 'Verdes Mares'),
  ('jardim marileia', 'Jardim Mariléa'),
  ('jd. marileia', 'Jardim Mariléa'),
  ('chacara marileia', 'Chácara Mariléa'),
  ('marilea chacara', 'Chácara Mariléa'),
  ('colinas r das ostras', 'Colinas'),
  ('loteamento colinas', 'Colinas'),
  ('res rio das ostras', 'Residencial Rio das Ostras'),
  ('village r das ostras', 'Village Rio das Ostras'),
  ('vilage rio das ostras', 'Village Rio das Ostras'),
  ('ext novorio ostras', 'Extensão Novo Rio das Ostras'),
  ('novorio das ostras', 'Novo Rio das Ostras'),
  ('ext do bosque', 'Extensão do Bosque'),
  ('extenso do bosque', 'Extensão do Bosque'),
  ('ext. do bosque', 'Extensão do Bosque'),
  ('extensao dobosque', 'Extensão do Bosque'),
  ('loteamento extensao do bosque', 'Extensão do Bosque'),
  ('lt ext. bosque praia', 'Extensão do Bosque'),
  ('ext.bosque da praia', 'Extensão do Bosque'),
  ('floresta gaivotas', 'Floresta das Gaivotas'),
  ('enseada das gaiovotas', 'Enseada das Gaivotas'),
  ('bosque d areia', 'Bosque da Areia'),
  ('loteamento atlantica', 'Atlântica'),
  ('jardim atlantica', 'Atlântica'),
  ('loteamento mar do norte', 'Mar do Norte'),
  ('mar do note', 'Mar do Norte'),
  ('praia nova - mar do norte', 'Mar do Norte'),
  ('res camping d bosque', 'Residencial Camping do Bosque'),
  ('loteamento terra firme', 'Terra Firme'),
  ('loteamento residencial terras do contorno', 'Terras do Contorno'),
  ('bairro operario', 'Operário'),
  ('apicelo', 'Gelson Apicelo'),
  ('jardim campo mar', 'Jardim Campomar'),
  ('jardm campomar', 'Jardim Campomar'),
  ('canta galo', 'Cantagalo'),
  ('novacidade', 'Nova Cidade'),
  ('bairro nova alianca', 'Nova Aliança'),
  ('praiamar', 'Praia Mar'),
  ('faz das palmeiras', 'Fazenda Palmeiras'),
  ('loteam. casa grande', 'Casa Grande'),
  ('bela vista', 'Jardim Bela Vista')
) as v (nome_receita, bairro)
join public.bairros b on b.nome = v.bairro
where c.slug = 'rio-das-ostras' and b.cidade_id = c.id;

-- O pedido fica no histórico depois que o perfil é apagado.
alter table public.pedidos_perfil
  alter column anunciante_id drop not null,
  drop constraint pedidos_perfil_anunciante_id_fkey,
  add constraint pedidos_perfil_anunciante_id_fkey foreign key (anunciante_id) references public.anunciantes (id) on delete set null,
  add column cnpj text check (cnpj ~ '^[0-9]{14}$'),
  add column nome_comercio text check (length(nome_comercio) <= 100),
  add column observacao_admin text check (length(observacao_admin) <= 1000);

create trigger marcar_atualizacao before update on public.apelidos_bairro for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.cnpjs_bloqueados for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.apelidos_bairro for each row execute function interno.auditar();

alter table public.cnpjs_bloqueados enable row level security;
alter table public.apelidos_bairro enable row level security;

create policy "visitante sem acesso" on public.cnpjs_bloqueados as restrictive for all to anon using (false) with check (false);
create policy "administrador lê e altera" on public.cnpjs_bloqueados
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "visitante sem acesso" on public.apelidos_bairro as restrictive for all to anon using (false) with check (false);
create policy "administrador lê e altera" on public.apelidos_bairro
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

/**
 * Confirma um pedido de "remover" ou "fechou": guarda CNPJ e nome no pedido,
 * bloqueia o CNPJ e apaga o perfil (os dados da Receita saem junto). Tudo ou
 * nada, só pelo administrador, com auditoria das tabelas envolvidas.
 */
create function public.confirmar_remocao_pedido(p_pedido uuid, p_observacao text) returns void
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  pedido public.pedidos_perfil;
  receita public.dados_receita;
  nome_atual text;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração confirma pedidos.';
  end if;
  select * into pedido from public.pedidos_perfil where id = p_pedido for update;
  if pedido.id is null or pedido.situacao <> 'aberto' or pedido.tipo not in ('remover', 'fechou') or pedido.anunciante_id is null then
    raise exception 'Pedido não encontrado ou já atendido.';
  end if;
  select * into receita from public.dados_receita where anunciante_id = pedido.anunciante_id;
  select nome into nome_atual from public.anunciantes where id = pedido.anunciante_id;

  if receita.cnpj is not null then
    insert into public.cnpjs_bloqueados (cidade_id, cnpj, motivo) values (receita.cidade_id, receita.cnpj, pedido.tipo::text)
    on conflict (cidade_id, cnpj) do nothing;
  end if;
  update public.pedidos_perfil
  set situacao = 'atendido', atendido_por = auth.uid(), atendido_em = now(),
      cnpj = receita.cnpj, nome_comercio = left(nome_atual, 100), observacao_admin = nullif(left(trim(coalesce(p_observacao, '')), 1000), '')
  where id = p_pedido;
  -- Os outros pedidos abertos do mesmo perfil ficam atendidos junto.
  update public.pedidos_perfil
  set situacao = 'atendido', atendido_por = auth.uid(), atendido_em = now(), cnpj = receita.cnpj, nome_comercio = left(nome_atual, 100)
  where anunciante_id = pedido.anunciante_id and situacao = 'aberto' and id <> p_pedido;
  delete from public.anunciantes where id = pedido.anunciante_id;
end
$$;

revoke execute on function public.confirmar_remocao_pedido(uuid, text) from public, anon;
grant execute on function public.confirmar_remocao_pedido(uuid, text) to authenticated;

create or replace function interno.anunciante_json(p_id uuid, p_completo boolean) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id,
    'slug', a.slug,
    'cidadeId', ci.slug,
    'tipo', a.tipo,
    'origem', a.origem,
    -- Importado que já tem dono (convite enviado): some a seção "Este comércio é seu?".
    'assumido', a.usuario_id is not null,
    'nome', a.nome,
    'categoriaId', cp.slug_lista,
    'categoriasAdicionais', coalesce((
      select jsonb_agg(c.slug_lista order by c.nome)
      from public.anunciante_categorias ac
      join public.categorias c on c.id = ac.categoria_id
      where ac.anunciante_id = a.id and c.id <> a.categoria_principal_id and c.ativa
    ), '[]'::jsonb),
    'planoId', p.codigo,
    'fundador', a.fundador,
    'descricao', a.descricao,
    'whatsapp', a.whatsapp,
    'telefone', a.telefone,
    'instagram', a.instagram,
    'formasPagamento', to_jsonb(a.formas_pagamento),
    'registroConselho', a.registro_conselho,
    'fotoPerfil', jsonb_build_object('id', a.id, 'caminho', (
      select interno.caminho_foto(f.chave, f.formato) from public.fotos f
      where f.anunciante_id = a.id and f.finalidade = 'perfil' and f.situacao = 'publicado'
      order by f.ordem limit 1
    )),
    'galeria', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'caminho', interno.caminho_foto(f.chave, f.formato), 'legenda', f.legenda, 'parId', f.par_id, 'papelNoPar', f.papel_no_par) order by f.ordem)
      from public.fotos f
      where f.anunciante_id = a.id and f.finalidade = 'galeria' and f.situacao = 'publicado'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'horario', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'intervalos', d.intervalos) order by d.dia)
      from (
        select h.dia_semana as dia,
          jsonb_agg(jsonb_build_object('abre', to_char(h.abre, 'HH24:MI'), 'fecha', to_char(h.fecha, 'HH24:MI')) order by h.abre) as intervalos
        from public.horarios h where h.anunciante_id = a.id
        group by h.dia_semana
      ) d
    ), '[]'::jsonb) else '[]'::jsonb end,
    'atendeTodaCidade', case when a.tipo = 'profissional' then a.atende_toda_cidade end,
    'bairrosAtendidos', case when a.tipo = 'profissional' then coalesce((
      select jsonb_agg(b.slug order by b.nome)
      from public.anunciante_bairros ab join public.bairros b on b.id = ab.bairro_id
      where ab.anunciante_id = a.id and ab.finalidade = 'atendimento'
    ), '[]'::jsonb) end,
    'enderecos', case when a.tipo = 'comercio' then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', e.id,
        'logradouro', e.logradouro,
        'numero', e.numero,
        'complemento', e.complemento,
        'bairroId', b.slug,
        'latitude', extensions.st_y(e.local::extensions.geometry),
        'longitude', extensions.st_x(e.local::extensions.geometry)
      )) order by e.principal desc, e.criado_em)
      from public.enderecos e join public.bairros b on b.id = e.bairro_id
      where e.anunciante_id = a.id
    ), '[]'::jsonb) end,
    'encartes', case when a.tipo = 'comercio' then '[]'::jsonb end,
    'produtos', case when a.tipo = 'comercio' then '[]'::jsonb end,
    'entrega', case when a.tipo = 'comercio' and a.faz_entrega then jsonb_build_object(
      'todaCidade', a.entrega_toda_cidade,
      'bairros', coalesce((
        select jsonb_agg(b.slug order by b.nome)
        from public.anunciante_bairros ab join public.bairros b on b.id = ab.bairro_id
        where ab.anunciante_id = a.id and ab.finalidade = 'entrega'
      ), '[]'::jsonb)
    ) end,
    'siteProprio', case when a.tipo = 'comercio' then a.site_proprio end
  ))
  from public.anunciantes a
  join public.cidades ci on ci.id = a.cidade_id
  join public.categorias cp on cp.id = a.categoria_principal_id
  left join public.planos p on p.id = a.plano_id
  where a.id = p_id and a.status = 'publicado'
$$;
