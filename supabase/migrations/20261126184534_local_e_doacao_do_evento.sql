-- Local do evento e entrada por doação (decisões D1 e D5 de 26/11/2026).
--
-- D1: o evento pode dizer em que comércio do site acontece (o perfil do local),
-- e a página do evento leva ao perfil dele. Não muda quem paga nem põe o evento
-- no perfil do comércio (a seção Agenda do perfil continua sendo do extra
-- Agenda ou do Premium). O visitante só vê o link quando o perfil está no ar
-- (o RLS de anunciantes só entrega os publicados).
--
-- D5: quarto tipo de entrada, "doação", com o que a pessoa leva para entrar
-- (por exemplo, 1 kg de alimento não perecível ou 1 kg de ração por pessoa).

alter type public.entrada_evento add value if not exists 'doacao';

alter table public.eventos
  add column local_anunciante_id uuid references public.anunciantes (id) on delete set null,
  add column doacao text check (length(trim(doacao)) between 3 and 160);

comment on column public.eventos.local_anunciante_id is 'Comércio do site onde o evento acontece (link na página do evento).';
comment on column public.eventos.doacao is 'O que se leva para entrar, na entrada por doação.';

-- Compara como texto: o valor novo do tipo ainda não pode ser usado nesta mesma transação.
alter table public.eventos add constraint eventos_doacao_com_entrada check ((entrada::text = 'doacao') = (doacao is not null));

create index eventos_local_anunciante_idx on public.eventos (local_anunciante_id) where local_anunciante_id is not null;
