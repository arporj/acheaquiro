-- Escala do desconto de Fundador salva numa transação com o aviso aos
-- administradores (decisão de 28/10/2026): as páginas públicas leem a escala
-- do banco, mas os Termos de Uso, a especificação e o material de divulgação
-- são textos fixos. Quem muda a escala vê na tela, e todos os administradores
-- recebem por e-mail, a lista dos documentos a atualizar.

-- Avisos aos administradores não são de um anunciante.
alter table public.avisos_email alter column anunciante_id drop not null;
alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador'));
alter table public.avisos_email add constraint avisos_email_destinatario_check
  check ((tipo = 'escala_fundador') = (anunciante_id is null));

/**
 * Salva a escala (já conferida por validarEscalaFundador no servidor) e põe na
 * fila um e-mail para cada administrador ativo. p_antes é a escala que o
 * servidor leu: se outra pessoa mudou no meio do caminho, nada é gravado.
 * p_textos: {antes, depois, documentos[]}, montados no servidor.
 */
create function public.salvar_escala_fundador(p_escala jsonb, p_antes jsonb, p_textos jsonb) returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_cidade uuid := (select id from public.cidades where slug = 'rio-das-ostras');
  v_atual jsonb;
  v_avisos integer;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração altera o desconto de Fundador.';
  end if;
  if jsonb_typeof(p_escala) <> 'array' or jsonb_array_length(p_escala) not between 1 and 5 then
    raise exception 'Escala do desconto de Fundador inválida.';
  end if;
  if exists (select 1 from public.anunciantes where cidade_id = v_cidade and fundador) then
    raise exception 'Já há Fundadores: a escala não muda mais, porque mudaria o valor deles sem o aviso de 30 dias.';
  end if;
  select valor into v_atual from public.configuracoes where cidade_id = v_cidade and chave = 'desconto_fundador_escala' for update;
  if v_atual is distinct from p_antes then
    raise exception 'Outra pessoa mudou a escala agora. Atualize a página.';
  end if;

  update public.configuracoes set valor = p_escala, atualizado_em = now()
  where cidade_id = v_cidade and chave = 'desconto_fundador_escala';

  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  select v_cidade, null, 'escala_fundador', interno.hoje(), u.email,
         jsonb_build_object('antes', p_textos ->> 'antes', 'depois', p_textos ->> 'depois', 'documentos', p_textos -> 'documentos'),
         0
  from public.perfis_usuario p
  join auth.users u on u.id = p.usuario_id
  where p.papel = 'administrador' and p.ativo and u.email is not null;
  get diagnostics v_avisos = row_count;
  return v_avisos;
end
$$;

revoke execute on function public.salvar_escala_fundador(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_escala_fundador(jsonb, jsonb, jsonb) to authenticated;
