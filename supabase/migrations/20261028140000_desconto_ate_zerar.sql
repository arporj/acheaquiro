-- Decisão T2 (28/10/2026): o representante pode dar de desconto a comissão
-- inteira do pagamento, mesmo que o anunciante não pague nada nele (por
-- exemplo, a 1ª mensalidade de graça). O pagamento de valor zero só existe
-- com o desconto do representante; os outros continuam maiores que zero.
alter table public.pagamentos drop constraint pagamentos_valor_centavos_check;
alter table public.pagamentos add constraint pagamentos_valor_centavos_check
  check (valor_centavos > 0 or (valor_centavos = 0 and desconto_representante_centavos > 0));
