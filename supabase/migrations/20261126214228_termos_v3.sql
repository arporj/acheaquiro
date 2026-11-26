-- Termos de Uso, versão 3 (decisões F1 a F4 e V1 a V4 de 26/11/2026; texto em
-- apps/web/src/conteudo/termos-v3.md): só o item 7.5 (Fundadores) muda.
-- Vira Fundador quem paga a assinatura, mensal ou anual, até 26/11/2026; a
-- partir de 27/11/2026, mais 100 vagas para o primeiro pagamento de um plano
-- pago; o desconto vale no mensal e no anual; trocar entre os dois não tira a
-- condição. Vale a partir de hoje: interno.aceitou_documento passa a exigir a
-- versão 3, e a área do anunciante pede o novo aceite no próximo acesso.
--
-- Aviso por e-mail (item 15) a cada conta ativa de anunciante ou cliente que já
-- aceitou os Termos, uma vez só, pela fila de avisos. Contado antes de aplicar
-- (aviso em massa, decisão de 24/11/2026): 3 e-mails, que saem no mesmo dia.
-- A função enviar-avisos lê o resumo das mudanças em dados.mudancas e foi
-- publicada antes desta migration.

insert into public.documentos_legais (documento, versao, vigente_desde, texto_url) values
  ('termos', '3', '2026-11-26', '/termos/v3');

insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
select c.id, null, 'termos_novos', date '2026-11-26', u.email,
       jsonb_build_object(
         'nome', p.nome,
         'versao', '3',
         'vigenteDesde', '2026-11-26',
         'mudancas',
         'o item 7.5, dos Fundadores. É Fundador quem paga a assinatura de um plano pago, mensal ou anual, até 26/11/2026, '
           || 'e o desconto de Fundador vale no mensal e no anual, com a troca entre os dois sem perder a condição. '
           || 'A partir de 27/11/2026, há mais 100 vagas de Fundador para o primeiro pagamento de um plano pago, até acabarem'
       ),
       2
from public.perfis_usuario p
join auth.users u on u.id = p.usuario_id
cross join (select id from public.cidades where slug = 'rio-das-ostras') c
where p.papel = 'anunciante' and p.ativo and u.email is not null and u.email not like '%.invalid'
  and exists (select 1 from public.aceites_documentos a where a.usuario_id = p.usuario_id and a.documento = 'termos');
