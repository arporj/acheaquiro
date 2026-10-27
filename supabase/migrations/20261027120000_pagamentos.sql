-- Pagamentos do plano registrados pela equipe (item 4.15; decisões de 23 e
-- 27/10/2026):
-- - contas que recebem: Pix (conta do André) e Maquininha (conta da Érica),
--   com os nomes editáveis pela administração;
-- - assinatura: uma por anunciante, com o dia de vencimento (âncora) e o
--   vencimento em vigor;
-- - pagamento: forma (Pix, débito ou crédito, com parcelas e código de
--   autorização no cartão), conta, data, comprovante opcional e o período pago.
--   A taxa da maquininha não fica no sistema: o valor é o do sistema;
-- - comissão do representante, aguardando 7 dias depois da confirmação;
-- - devolução do primeiro pagamento, que cancela a comissão, o plano e a
--   condição de Fundador ganha com ele.
-- Os valores (período, Fundador, valor, comissão) são calculados no servidor
-- pelas regras de packages/domain (calcularPagamentoPlano, testadas); o banco
-- grava tudo numa transação e confere a ordem dos pagamentos.

-- ---------------------------------------------------------------------------
-- Contas que recebem
-- ---------------------------------------------------------------------------

create table public.contas_recebimento (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  nome text not null check (length(nome) between 2 and 60),
  meio text not null check (meio in ('pix', 'maquininha')),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
-- A forma de pagamento escolhe a conta: uma conta ativa por meio.
create unique index contas_recebimento_meio_ativa on public.contas_recebimento (cidade_id, meio) where ativa;

insert into public.contas_recebimento (cidade_id, nome, meio) values
  ((select id from public.cidades where slug = 'rio-das-ostras'), 'Pix (conta do André)', 'pix'),
  ((select id from public.cidades where slug = 'rio-das-ostras'), 'Maquininha (conta da Érica)', 'maquininha');

-- ---------------------------------------------------------------------------
-- Assinatura do plano
-- ---------------------------------------------------------------------------

create table public.assinaturas (
  anunciante_id uuid primary key references public.anunciantes (id) on delete cascade,
  cidade_id uuid not null references public.cidades (id),
  plano_id uuid not null references public.planos (id),
  periodicidade text not null check (periodicidade in ('mensal', 'anual')),
  -- Dia em que a assinatura começou: os vencimentos caem sempre nesse dia.
  ancora date not null,
  vence_em date not null check (vence_em > ancora),
  -- Representante que atendeu a venda do plano (recebe as parcelas da comissão).
  representante_id uuid references public.representantes (id),
  atualizado_em timestamptz not null default now()
);
create index assinaturas_vence_em_idx on public.assinaturas (cidade_id, vence_em);

-- ---------------------------------------------------------------------------
-- Pagamentos
-- ---------------------------------------------------------------------------

create type public.forma_recebimento as enum ('pix', 'debito', 'credito');

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  -- Registro financeiro: não some com o cadastro (guarda por obrigação legal).
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,
  plano_id uuid not null references public.planos (id),
  periodicidade text not null check (periodicidade in ('mensal', 'anual')),
  -- Qual pagamento da assinatura este é (1, 2, 3...), contando só os não devolvidos.
  numero smallint not null check (numero >= 1),
  periodo_inicio date not null,
  vence_em date not null check (vence_em > periodo_inicio),
  valor_cheio_centavos integer not null check (valor_cheio_centavos > 0),
  desconto_fundador_centavos integer not null default 0 check (desconto_fundador_centavos >= 0),
  valor_centavos integer not null check (valor_centavos > 0),
  forma public.forma_recebimento not null,
  parcelas smallint not null default 1 check (parcelas between 1 and 12),
  codigo_autorizacao text check (codigo_autorizacao ~ '^[A-Za-z0-9]{4,20}$'),
  conta_id uuid not null references public.contas_recebimento (id),
  pago_em date not null,
  confirmado_em date not null,
  comprovante_caminho text check (comprovante_caminho ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|pdf)$'),
  representante_id uuid references public.representantes (id),
  -- Este pagamento fez o anunciante virar Fundador (a devolução desfaz).
  tornou_fundador boolean not null default false,
  observacao text not null default '' check (length(observacao) <= 300),
  registrado_por uuid not null references auth.users (id),
  registrado_em timestamptz not null default now(),
  devolvido_em timestamptz,
  devolvido_por uuid references auth.users (id),
  motivo_devolucao text check (length(motivo_devolucao) between 3 and 300),
  check (valor_centavos = valor_cheio_centavos - desconto_fundador_centavos),
  check (forma = 'credito' or parcelas = 1),
  check ((forma = 'pix') = (codigo_autorizacao is null)),
  check (confirmado_em >= pago_em),
  check ((devolvido_em is null) = (motivo_devolucao is null) and (devolvido_em is null) = (devolvido_por is null))
);
create index pagamentos_anunciante_idx on public.pagamentos (anunciante_id, numero);
create index pagamentos_pago_em_idx on public.pagamentos (cidade_id, pago_em);
-- Dois pagamentos válidos com o mesmo número seriam o mesmo período pago duas vezes.
create unique index pagamentos_numero_valido on public.pagamentos (anunciante_id, numero) where devolvido_em is null;

-- ---------------------------------------------------------------------------
-- Comissões
-- ---------------------------------------------------------------------------

create table public.comissoes (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  representante_id uuid not null references public.representantes (id),
  pagamento_id uuid not null references public.pagamentos (id) on delete restrict,
  origem text not null check (origem in ('plano', 'extra', 'patrocinio', 'upgrade')),
  base_centavos integer not null check (base_centavos >= 0),
  percentual numeric(7, 3) not null check (percentual > 0),
  valor_centavos integer not null check (valor_centavos > 0),
  libera_em date not null,
  cancelada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (pagamento_id, origem)
);
create index comissoes_representante_idx on public.comissoes (representante_id, libera_em);

-- ---------------------------------------------------------------------------
-- Datas de atualização e auditoria
-- ---------------------------------------------------------------------------

create trigger marcar_atualizacao before update on public.assinaturas for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.contas_recebimento for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.assinaturas for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.pagamentos for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.comissoes for each row execute function interno.auditar();

-- ---------------------------------------------------------------------------
-- RLS: política explícita para cada papel
-- ---------------------------------------------------------------------------

alter table public.contas_recebimento enable row level security;
alter table public.assinaturas enable row level security;
alter table public.pagamentos enable row level security;
alter table public.comissoes enable row level security;

do $$
declare
  tabela text;
begin
  foreach tabela in array array['contas_recebimento', 'assinaturas', 'pagamentos', 'comissoes'] loop
    execute format('create policy "visitante sem acesso" on public.%I as restrictive for all to anon using (false) with check (false)', tabela);
    execute format(
      'create policy "administrador lê e altera" on public.%I for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()))',
      tabela);
  end loop;
end
$$;

-- Contas: só a administração.
create policy "anunciante sem acesso às contas" on public.contas_recebimento for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante sem acesso às contas" on public.contas_recebimento for select to authenticated
  using (false and (select interno.tem_papel('representante')));

-- Assinatura: o anunciante vê a própria; o representante, a dos anunciantes que trouxe.
create policy "anunciante lê a própria assinatura" on public.assinaturas for select to authenticated
  using ((select interno.tem_papel('anunciante')) and exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.usuario_id = (select auth.uid())));
create policy "representante lê as assinaturas dos que trouxe" on public.assinaturas for select to authenticated
  using (exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.representante_id = (select interno.meu_representante_id())));

-- Pagamentos: o anunciante vê os próprios; o representante vê a comissão, não o pagamento.
create policy "anunciante lê os próprios pagamentos" on public.pagamentos for select to authenticated
  using ((select interno.tem_papel('anunciante')) and exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.usuario_id = (select auth.uid())));
create policy "representante sem acesso aos pagamentos" on public.pagamentos for select to authenticated
  using (false and (select interno.tem_papel('representante')));

-- Comissões: o representante vê as próprias; o anunciante, nenhuma.
create policy "representante lê as próprias comissões" on public.comissoes for select to authenticated
  using (representante_id = (select interno.meu_representante_id()));
create policy "anunciante sem acesso às comissões" on public.comissoes for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));

-- ---------------------------------------------------------------------------
-- Comprovantes: área privada do Storage, só a administração
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 5242880, array['image/webp', 'image/jpeg', 'application/pdf']);

create policy "administrador envia comprovantes" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and (select interno.eh_admin()));
create policy "administrador lê comprovantes" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and (select interno.eh_admin()));
create policy "administrador apaga comprovantes" on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and (select interno.eh_admin()));

-- ---------------------------------------------------------------------------
-- Registro do pagamento
-- ---------------------------------------------------------------------------

/**
 * Grava o pagamento do plano, a assinatura, o plano em vigor, o Fundador, a
 * publicação do perfil e a comissão, numa transação. Os valores vêm do
 * servidor (calcularPagamentoPlano, em packages/domain). O banco confere que
 * ninguém registrou outro pagamento do mesmo anunciante no meio do caminho
 * (número e vencimento anterior esperados).
 */
create function public.registrar_pagamento_plano(
  p_anunciante uuid,
  p_plano uuid,
  p_periodicidade text,
  p_numero integer,
  p_vence_anterior date,
  p_ancora date,
  p_periodo_inicio date,
  p_vence_em date,
  p_valor_cheio integer,
  p_desconto_fundador integer,
  p_forma public.forma_recebimento,
  p_parcelas integer,
  p_codigo_autorizacao text,
  p_pago_em date,
  p_confirmado_em date,
  p_comprovante text,
  p_observacao text,
  p_representante uuid,
  p_fundador_desde date,
  p_tornou_fundador boolean,
  p_comissao_base integer,
  p_comissao_percentual numeric,
  p_comissao_valor integer,
  p_comissao_libera_em date
) returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare
  a record;
  ass record;
  validos integer;
  conta uuid;
  novo uuid;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos.';
  end if;
  select an.id, an.cidade_id, an.status, an.tipo into a from public.anunciantes an where an.id = p_anunciante for update;
  if a.id is null then
    raise exception 'Anunciante não encontrado.';
  end if;
  if a.status not in ('aguardando_pagamento', 'publicado', 'pausado', 'escondido_por_vencimento') then
    raise exception 'O cadastro precisa estar aprovado para receber pagamento.';
  end if;
  if not exists (select 1 from public.planos p where p.id = p_plano and p.cidade_id = a.cidade_id and p.tipo = a.tipo and p.valor_mensal_centavos > 0) then
    raise exception 'Plano inválido para este anunciante.';
  end if;

  select s.vence_em into ass from public.assinaturas s where s.anunciante_id = p_anunciante;
  select count(*) into validos from public.pagamentos pg where pg.anunciante_id = p_anunciante and pg.devolvido_em is null;
  if validos + 1 <> p_numero or ass.vence_em is distinct from p_vence_anterior then
    raise exception 'Outro pagamento deste anunciante foi registrado agora. Atualize a página.';
  end if;

  select c.id into conta from public.contas_recebimento c
  where c.cidade_id = a.cidade_id and c.ativa and c.meio = case when p_forma = 'pix' then 'pix' else 'maquininha' end;
  if conta is null then
    raise exception 'Não há conta ativa para esta forma de pagamento.';
  end if;

  insert into public.pagamentos (
    cidade_id, anunciante_id, plano_id, periodicidade, numero, periodo_inicio, vence_em, valor_cheio_centavos,
    desconto_fundador_centavos, valor_centavos, forma, parcelas, codigo_autorizacao, conta_id, pago_em, confirmado_em,
    comprovante_caminho, representante_id, tornou_fundador, observacao, registrado_por
  ) values (
    a.cidade_id, p_anunciante, p_plano, p_periodicidade, p_numero, p_periodo_inicio, p_vence_em, p_valor_cheio,
    p_desconto_fundador, p_valor_cheio - p_desconto_fundador, p_forma, p_parcelas, nullif(p_codigo_autorizacao, ''), conta, p_pago_em,
    p_confirmado_em, nullif(p_comprovante, ''), p_representante, p_tornou_fundador, coalesce(p_observacao, ''), auth.uid()
  ) returning id into novo;

  insert into public.assinaturas (anunciante_id, cidade_id, plano_id, periodicidade, ancora, vence_em, representante_id)
  values (p_anunciante, a.cidade_id, p_plano, p_periodicidade, p_ancora, p_vence_em, p_representante)
  on conflict (anunciante_id) do update
  set plano_id = excluded.plano_id, periodicidade = excluded.periodicidade, ancora = excluded.ancora,
      vence_em = excluded.vence_em, representante_id = coalesce(public.assinaturas.representante_id, excluded.representante_id);

  update public.anunciantes
  set plano_id = p_plano,
      plano_escolhido_id = p_plano,
      periodicidade_escolhida = p_periodicidade,
      fundador = p_fundador_desde is not null,
      fundador_desde = p_fundador_desde,
      status = case when status in ('aguardando_pagamento', 'escondido_por_vencimento') then 'publicado' else status end,
      aprovado_em = coalesce(aprovado_em, now()),
      aprovado_por = coalesce(aprovado_por, auth.uid())
  where id = p_anunciante;

  if p_comissao_valor is not null then
    if p_representante is null then
      raise exception 'Comissão sem representante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (a.cidade_id, p_representante, novo, 'plano', p_comissao_base, p_comissao_percentual, p_comissao_valor, p_comissao_libera_em);
  end if;
  return novo;
end
$$;

/**
 * Devolução do primeiro pagamento (o prazo de 7 dias é conferido no servidor,
 * podeDevolver em packages/domain): cancela a comissão, apaga a assinatura,
 * desfaz o Fundador ganho com o pagamento, passa o comércio para o Gratuito e
 * tira o autônomo do ar, aguardando um novo pagamento (decisão de 27/10/2026).
 */
create function public.registrar_devolucao(p_pagamento uuid, p_motivo text) returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  pg record;
  a record;
  gratuito uuid;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra devoluções.';
  end if;
  select * into pg from public.pagamentos where id = p_pagamento for update;
  if pg.id is null or pg.devolvido_em is not null then
    raise exception 'Pagamento não encontrado ou já devolvido.';
  end if;
  if pg.numero <> 1 then
    raise exception 'Só o primeiro pagamento de uma contratação pode ser devolvido.';
  end if;
  if exists (select 1 from public.pagamentos o where o.anunciante_id = pg.anunciante_id and o.id <> pg.id and o.devolvido_em is null) then
    raise exception 'Há pagamentos seguintes deste anunciante. Fale com o responsável pelo sistema.';
  end if;
  select an.id, an.tipo, an.cidade_id, an.status into a from public.anunciantes an where an.id = pg.anunciante_id for update;

  update public.pagamentos set devolvido_em = now(), devolvido_por = auth.uid(), motivo_devolucao = p_motivo where id = p_pagamento;
  update public.comissoes set cancelada_em = now() where pagamento_id = p_pagamento and cancelada_em is null;
  delete from public.assinaturas where anunciante_id = pg.anunciante_id;

  if a.tipo = 'comercio' then
    select p.id into gratuito from public.planos p
    where p.cidade_id = a.cidade_id and p.tipo = 'comercio' and p.ativo and p.valor_mensal_centavos = 0
    order by p.nivel limit 1;
    if gratuito is null then
      raise exception 'A cidade não tem plano Gratuito de comércio ativo.';
    end if;
  end if;

  update public.anunciantes
  set plano_id = gratuito,
      fundador = case when pg.tornou_fundador then false else fundador end,
      fundador_desde = case when pg.tornou_fundador then null else fundador_desde end,
      status = case when a.tipo = 'profissional' and status in ('publicado', 'pausado', 'escondido_por_vencimento') then 'aguardando_pagamento' else status end
  where id = pg.anunciante_id;
end
$$;

revoke execute on function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date
) from public, anon;
grant execute on function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date
) to authenticated;
revoke execute on function public.registrar_devolucao(uuid, text) from public, anon;
grant execute on function public.registrar_devolucao(uuid, text) to authenticated;
