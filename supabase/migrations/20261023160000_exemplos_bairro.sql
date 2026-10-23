-- Bairros da importação (pedido de 23/10/2026): junto de cada nome pendente, os
-- comércios que vieram com ele (nome, endereço e CEP), para a administração
-- decidir que bairro é. Gravado pelo script na etapa "preparar"; até 50 por nome.
alter table public.apelidos_bairro
  add column exemplos jsonb not null default '[]'::jsonb check (jsonb_typeof(exemplos) = 'array');
