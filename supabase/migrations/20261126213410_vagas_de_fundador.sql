-- Vagas de Fundador depois do prazo (decisão de 24/11/2026; V1 a V4 de
-- 26/11/2026): a partir do dia seguinte ao prazo dos Fundadores, os primeiros
-- anunciantes que pagam um plano pago, mensal ou anual, viram Fundadores, até
-- acabarem as vagas (100, em configuracoes.vagas_fundador_depois_do_prazo,
-- editável em /admin/configuracoes). Os Fundadores até o prazo não ocupam vaga.
--
-- Ocupa vaga o pagamento de plano pago depois do prazo que tornou Fundador e
-- não foi devolvido nem contestado (V2: com a devolução, a vaga volta). Quem
-- perde a condição depois continua ocupando a vaga (V3). Sem data final (V4).
-- A regra fica em packages/domain/cobranca.ts (tornaFundador e
-- vagasFundadorRestantes) e em calcularPagamentoPlano (só o primeiro pagamento
-- do anunciante ocupa vaga); aqui ficam a contagem e a trava contra dois
-- registros ao mesmo tempo na última vaga.

insert into public.configuracoes (cidade_id, chave, valor)
select c.id, 'vagas_fundador_depois_do_prazo', to_jsonb(100)
from public.cidades c
where c.slug = 'rio-das-ostras'
on conflict (cidade_id, chave) do nothing;

/** Vagas usadas depois do prazo, pela mesma regra de vagasFundadorRestantes. */
create or replace function interno.vagas_fundador(p_cidade_id uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with config as (
    select
      (select (c.valor #>> '{}')::date from public.configuracoes c
        where c.cidade_id = p_cidade_id and c.chave = 'prazo_fundador') as prazo,
      coalesce((select (c.valor #>> '{}')::integer from public.configuracoes c
        where c.cidade_id = p_cidade_id and c.chave = 'vagas_fundador_depois_do_prazo'), 0) as total
  )
  select jsonb_build_object(
    'total', config.total,
    'usadas', (
      select count(*)
      from public.pagamentos p
      where p.cidade_id = p_cidade_id
        and p.tipo = 'plano'
        and p.tornou_fundador
        and p.devolvido_em is null
        and p.pago_em > config.prazo
    )
  )
  from config
$$;
revoke execute on function interno.vagas_fundador(uuid) from public, anon, authenticated;

/**
 * Vagas de Fundador da cidade, para as páginas públicas, a proposta e o
 * registro do pagamento. Só números: não diz quem ocupa as vagas.
 */
create or replace function public.vagas_fundador(p_cidade text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select interno.vagas_fundador(c.id) from public.cidades c where c.slug = p_cidade
$$;
revoke all on function public.vagas_fundador(text) from public;
grant execute on function public.vagas_fundador(text) to anon, authenticated;

/**
 * Trava da última vaga: o servidor calcula a vaga antes de gravar, e dois
 * registros ao mesmo tempo poderiam passar do total. Um pagamento por vez por
 * cidade confere a contagem antes de gravar.
 */
create or replace function interno.conferir_vaga_fundador() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  prazo date;
  vagas jsonb;
begin
  if new.tipo <> 'plano' or not new.tornou_fundador then
    return new;
  end if;
  select (c.valor #>> '{}')::date into prazo
  from public.configuracoes c where c.cidade_id = new.cidade_id and c.chave = 'prazo_fundador';
  if prazo is null or new.pago_em <= prazo then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('vagas_fundador'), hashtext(new.cidade_id::text));
  vagas := interno.vagas_fundador(new.cidade_id);
  if (vagas ->> 'usadas')::integer >= (vagas ->> 'total')::integer then
    raise exception 'As vagas de Fundador acabaram. Volte à tela anterior para ver o valor sem o desconto.';
  end if;
  return new;
end
$$;
revoke execute on function interno.conferir_vaga_fundador() from public, anon, authenticated;

create trigger conferir_vaga_fundador before insert on public.pagamentos
for each row execute function interno.conferir_vaga_fundador();
