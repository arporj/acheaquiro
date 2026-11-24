-- Política de Privacidade, versão 2 (decisões V1 e V2 de 24/11/2026, texto em
-- apps/web/src/conteudo/privacidade-v2.md): junta a versão 1 com o rascunho de
-- 23/10/2026 (comércios importados da Receita, pedidos sobre o perfil,
-- atendimento, cartão, representantes) e acrescenta os eventos da Agenda
-- (organizadores, artistas e barracas). Vale a partir de hoje:
-- interno.aceitou_documento passa a exigir a versão 2, e a área do anunciante
-- pede o novo aceite no próximo acesso (/anunciante/aceite).
-- Aviso por e-mail (item 11) a cada conta ativa de anunciante ou cliente que já
-- aceitou a Política, uma vez só, pela fila de avisos (Edge Function
-- enviar-avisos, publicada antes desta migration).

insert into public.documentos_legais (documento, versao, vigente_desde, texto_url) values
  ('privacidade', '2', '2026-11-24', '/privacidade/v2');

alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador', 'proposta', 'denuncia',
                  'pagamento_antes_do_aceite', 'extra_lembrete_7_dias', 'extra_lembrete_vencimento', 'extra_vencido', 'termos_novos',
                  'privacidade_nova'));
alter table public.avisos_email drop constraint avisos_email_destinatario_check;
alter table public.avisos_email add constraint avisos_email_destinatario_check
  check ((tipo in ('escala_fundador', 'denuncia', 'termos_novos', 'privacidade_nova')) = (anunciante_id is null));

insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
select c.id, null, 'privacidade_nova', date '2026-11-24', u.email, jsonb_build_object('nome', p.nome, 'versao', '2', 'vigenteDesde', '2026-11-24'), 2
from public.perfis_usuario p
join auth.users u on u.id = p.usuario_id
cross join (select id from public.cidades where slug = 'rio-das-ostras') c
where p.papel = 'anunciante' and p.ativo and u.email is not null and u.email not like '%.invalid'
  and exists (select 1 from public.aceites_documentos a where a.usuario_id = p.usuario_id and a.documento = 'privacidade');
