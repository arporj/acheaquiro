-- Termos de Uso, versão 2 (decisão K4 de 17/11/2026, publicada em 18/11/2026,
-- texto em apps/web/src/conteudo/termos-v2.md): organizador de eventos (itens
-- 1, 2, 4, 13 e 15), eventos na Agenda (item 6.5) e devolução do evento
-- avulso (item 7.6). Vale a partir de hoje: interno.aceitou_documento passa a
-- exigir a versão 2, e a área do anunciante pede o novo aceite no próximo
-- acesso (/anunciante/aceite).
-- Aviso por e-mail (item 15) a cada conta ativa de anunciante ou cliente que já
-- aceitou os Termos, uma vez só, pela fila de avisos (Edge Function
-- enviar-avisos). O aviso não é de um anúncio: anunciante_id vazio.

insert into public.documentos_legais (documento, versao, vigente_desde, texto_url) values
  ('termos', '2', '2026-11-18', '/termos/v2');

alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador', 'proposta', 'denuncia',
                  'pagamento_antes_do_aceite', 'extra_lembrete_7_dias', 'extra_lembrete_vencimento', 'extra_vencido', 'termos_novos'));
alter table public.avisos_email drop constraint avisos_email_destinatario_check;
alter table public.avisos_email add constraint avisos_email_destinatario_check
  check ((tipo in ('escala_fundador', 'denuncia', 'termos_novos')) = (anunciante_id is null));

insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
select c.id, null, 'termos_novos', date '2026-11-18', u.email, jsonb_build_object('nome', p.nome, 'versao', '2', 'vigenteDesde', '2026-11-18'), 2
from public.perfis_usuario p
join auth.users u on u.id = p.usuario_id
cross join (select id from public.cidades where slug = 'rio-das-ostras') c
where p.papel = 'anunciante' and p.ativo and u.email is not null and u.email not like '%.invalid'
  and exists (select 1 from public.aceites_documentos a where a.usuario_id = p.usuario_id and a.documento = 'termos');
