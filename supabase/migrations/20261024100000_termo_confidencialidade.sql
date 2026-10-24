-- Termo de confidencialidade do representante (decisão de 23/10/2026). O valor
-- novo do tipo fica numa migration só dele: o Postgres não deixa usar um valor
-- de enum na mesma transação em que ele foi criado.
alter type public.documento_legal add value 'confidencialidade';
