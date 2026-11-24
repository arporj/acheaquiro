-- Cadastro próprio do anunciante (decisões G1 a G6 de 24/11/2026; especificação
-- item 4.6). A conta criada pelo site já nasce com o papel de anunciante
-- (interno.criar_perfil_usuario) e o dono já cria o próprio rascunho, edita as
-- tabelas do perfil e o envia para análise com o aceite em vigor
-- (interno.proteger_anunciante e interno.exigir_aceite). Esta migration
-- acrescenta:
--   1. o representante indicado pelo código, que vira quem trouxe o anunciante
--      na aprovação (mesma regra do "É seu?", decisões C1 e C2 de 06/11/2026);
--   2. "Para conferir" (G4): o que o dono muda no perfil publicado vai para o ar
--      na hora e marca o anunciante para a equipe conferir (revisar), sem análise
--      prévia; a análise de verdade só acontece com denúncia.

-- ---------------------------------------------------------------------------
-- 1. Representante indicado
-- ---------------------------------------------------------------------------

alter table public.anunciantes
  add column representante_indicado_id uuid references public.representantes (id) on delete set null;

create index anunciantes_representante_indicado_idx on public.anunciantes (representante_indicado_id)
  where representante_indicado_id is not null;

comment on column public.anunciantes.representante_indicado_id is
  'Representante do código informado no cadastro próprio; na aprovação, vira quem trouxe o anunciante (representante_id), se ninguém trouxe.';

/**
 * Trava e efeitos do cadastro próprio, depois das outras travas (o nome com
 * "zzz" faz este gatilho rodar por último entre os "before"):
 * - o indicado só muda pelo código (public.indicar_representante);
 * - na aprovação, o indicado vira quem trouxe o anunciante, se ninguém trouxe;
 * - mudança do dono (ou de quem não é da administração) no perfil publicado ou
 *   pausado marca "Para conferir" (revisar). Pausar e reativar não marcam.
 */
create function interno.cadastro_proprio() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Colunas que mudam sem ser alteração do perfil.
  livres constant text[] := array['status', 'atualizado_em', 'revisar'];
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin() then
    if tg_op = 'UPDATE' and old.status = 'em_analise' and new.status in ('publicado', 'aguardando_pagamento')
       and new.representante_id is null and new.representante_indicado_id is not null then
      new.representante_id := new.representante_indicado_id;
    end if;
    return new;
  end if;
  if current_setting('app.indicacao', true) = 'sim' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.representante_indicado_id is not null then
      raise exception 'O representante indicado é informado pelo código.';
    end if;
    return new;
  end if;
  if new.representante_indicado_id is distinct from old.representante_indicado_id then
    raise exception 'O representante indicado é informado pelo código.';
  end if;
  if old.status in ('publicado', 'pausado') and (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    new.revisar := true;
  end if;
  return new;
end
$$;

create trigger zzz_cadastro_proprio before insert or update on public.anunciantes
for each row execute function interno.cadastro_proprio();

/**
 * Código do representante no cadastro próprio: liga o representante ativo do
 * código ao rascunho da própria conta. Código vazio tira a indicação. Devolve
 * false quando o código não é de um representante ativo.
 */
create function public.indicar_representante(p_codigo text) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  meu uuid;
  rep uuid;
  v_codigo text := lower(trim(coalesce(p_codigo, '')));
begin
  select a.id into meu
  from public.anunciantes a
  where a.usuario_id = auth.uid() and a.status = 'rascunho' and interno.tem_papel('anunciante')
  order by a.criado_em desc
  limit 1;
  if meu is null then
    raise exception 'Só o rascunho do próprio cadastro recebe o código do representante.';
  end if;
  if v_codigo <> '' then
    select r.id into rep
    from public.representantes r
    join public.perfis_usuario p on p.usuario_id = r.usuario_id
    where r.codigo = v_codigo and r.ativo and p.ativo;
    if rep is null then
      return false;
    end if;
  end if;
  perform set_config('app.indicacao', 'sim', true);
  update public.anunciantes set representante_indicado_id = rep where id = meu;
  perform set_config('app.indicacao', '', true);
  return true;
end
$$;

revoke execute on function public.indicar_representante(text) from public, anon;
grant execute on function public.indicar_representante(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. "Para conferir" quando o dono muda as partes do perfil publicado
-- ---------------------------------------------------------------------------

-- Mesma trava da migration 20261024140000, aceitando a marcação feita por
-- interno.perfil_para_conferir (só liga o revisar, nunca desliga).
create or replace function interno.proteger_importado() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin()
     or current_setting('app.vinculo_convite', true) = 'sim' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.importado_id is not null or new.revisar then
      raise exception 'O cadastro do comércio importado começa pelo botão da prospecção.';
    end if;
  elsif new.importado_id is distinct from old.importado_id
     or (new.revisar is distinct from old.revisar
         and not (current_setting('app.marcar_conferir', true) = 'sim' and new.revisar)) then
    raise exception 'Este campo só pode ser alterado pela administração.';
  end if;
  return new;
end
$$;

/** Categorias, bairros, endereço, horário e fotos mudados por quem não é da administração: o perfil no ar entra em "Para conferir". */
create function interno.perfil_para_conferir() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo uuid;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin() then
    return null;
  end if;
  if tg_op = 'DELETE' then
    alvo := old.anunciante_id;
  else
    alvo := new.anunciante_id;
  end if;
  perform set_config('app.marcar_conferir', 'sim', true);
  update public.anunciantes set revisar = true
  where id = alvo and status in ('publicado', 'pausado') and not revisar;
  perform set_config('app.marcar_conferir', '', true);
  return null;
end
$$;

revoke execute on function interno.perfil_para_conferir() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['anunciante_categorias', 'anunciante_bairros', 'enderecos', 'horarios', 'fotos'] loop
    execute format(
      'create trigger perfil_para_conferir after insert or update or delete on public.%I for each row execute function interno.perfil_para_conferir()',
      t);
  end loop;
end
$$;
