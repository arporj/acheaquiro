-- Chave Pix do sistema (decisão de 23/10/2026): passa a ser uma chave aleatória
-- de conta pessoal do André, de forma temporária, no lugar do CNPJ da empresa.
-- A troca para a conta da empresa volta a ser uma migration.
update public.configuracoes
set valor = '{"tipo":"aleatoria","chave":"947905cc-b0fb-4e81-8f5a-e13812ea3978"}'::jsonb
where chave = 'chave_pix'
  and cidade_id = (select id from public.cidades where slug = 'rio-das-ostras');
