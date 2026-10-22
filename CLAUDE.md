# Ache Aqui RO — instruções do projeto

## Sobre o projeto

Site aberto ao público que liga moradores e visitantes de Rio das Ostras a profissionais autônomos e comércios da cidade. O visitante busca e entra em contato sem criar conta; anunciantes, representantes e administradores têm conta com login.

Calendário: pré-cadastro dos Fundadores de 09/11 a 26/11/2026, feito pela equipe e pelos representantes. Abertura ao público e início da cobrança em 27/11/2026 (Black Friday), sem período gratuito. Fundador é quem paga a assinatura anual até 26/11/2026, sem limite de quantidade, e tem desconto nos planos e nos pacotes extras (não nos destaques nem nos links patrocinados) enquanto continuar Fundador: 50% nos 3 primeiros anos de assinatura e 25% do 4º ano em diante (decisão de 21/10/2026; os percentuais e os anos ficam em tabela no banco). O Selo Verificado, quando existir, é grátis para o Fundador. A renovação do Fundador é sempre anual: quem passa para o mensal, ou não renova em até 7 dias depois do vencimento, deixa de ser Fundador de vez (perde selo, desconto e vitrine). Enquanto Fundador, pode contratar pacotes extras mensais, com o desconto.

## Cobrança e representantes

- Na abertura, o pagamento é por Pix, mensal ou anual: o anunciante envia o comprovante pela sua área e a equipe confere e confirma na administração, o que ativa o plano com a validade correspondente. O pagamento automático pelo site (Pix e cartão, com renovação automática) vem depois da abertura.
- Plano vencido sem pagamento: o perfil do autônomo fica escondido, sem ser apagado, e o comércio passa para o plano Gratuito.
- Representantes atuam desde o pré-cadastro dos Fundadores. A comissão é calculada sobre o valor efetivamente pago, já com descontos. No plano, 135% de uma mensalidade (mensal: 100%, 20%, 10% e 5% das 4 primeiras; anual: de uma vez, sem nova comissão na renovação). Extras geram comissão só quando vendidos junto com a assinatura: 20% do valor pago pelo extra nessa venda, uma vez só.
- Destaque Exclusivo: vendido por dia, escolhido num calendário com os dias livres e ocupados. Diária e bloco de 30 dias seguidos ficam em extras.regras; a partir de 21 dias seguidos, o anunciante paga o bloco e os dias que faltam vão para os próximos dias livres (pode cancelá-los, sem devolução). Reserva com pelo menos 2 dias de antecedência, valendo a partir do dia seguinte à confirmação do Pix. Uma tarefa à meia-noite limpa o cache das páginas.
- Link patrocinado: pacote de 3 bairros ou cidade toda (no máximo 3 por categoria). Sem bairro escolhido pelo visitante, só os da cidade toda disputam o topo. Na aba Comércios, o bairro escolhido reordena em vez de esconder: os do bairro primeiro, depois os outros pela distância (com a localização do celular) ou pelos planos. O patrocinado continua também na posição do seu plano. Super Destaque: ordem sorteada a cada visita.

## Patrocinadores e Agenda

- Patrocinadores (proposta Patrocinadores v3, em docs/Comercial/Patrocinadores, ainda em discussão): empresas que apoiam o site como marca, sem perfil na lista e sem mudar a ordem dela. Cotas por 12 meses: Master (1 vaga), Ouro (3), Apoio (6), Grupo de categorias (1 por grupo), Categoria (1 por categoria, só quem não concorre com os anunciantes dela) e Agenda (1). Preço de Patrocinador Fundador para contrato fechado até 26/11/2026. Exclusividade de ramo em todas as cotas, menos Apoio. Pix à vista, sem renovação automática, sem comissão para representante, sem patrocínio político nem de apostas. Cotas, vagas, valores e benefícios ficam em tabela no banco.
- Onde aparecem: faixa "Oferecimento" no rodapé de todas as páginas (no computador, três colunas: Master com logo quadrado, os 3 Ouro com logo comprido um embaixo do outro e os 6 Apoio dois por linha, sem revezamento; no celular, uma parte embaixo da outra), a página /patrocinadores, o "patrocinado por" ao lado do grupo (na trilha de navegação) e da categoria, e ao lado do título da Agenda. Só o nome do patrocinador é link. Contato pelo endereço /p/[slug], com rel="sponsored". Nada aparece sem pelo menos 1 patrocinador ativo. O tamanho do logo de cada cota fica em FORMATOS_LOGO_PATROCINIO (packages/domain) e é mostrado na administração.
- Página da categoria: o título na tela é só a categoria ("Pizzarias"), porque o site é só da cidade; o título da aba e a prévia continuam com o nome da cidade, por causa do Google (decisão de 22/10/2026).
- Agenda (módulo de eventos, decisões de 21 e 22/10/2026): /agenda com os próximos 14 dias, filtro de bairro e busca por artista; /agenda/[evento] com a programação e as barracas; /artista/[slug] com os próximos shows e os anteriores; seção Agenda no perfil do comércio com o extra de Agenda.
- Situação em 22/10/2026: patrocinadores e Agenda existem só no site de apresentação, com dados fictícios (bares com Agenda: Quiosque Maré Cheia e Boteco da Praça). A versão de produção (migration, RLS, regra de vagas e exclusividade com testes, cadastro na administração, envio do logo e contagem de cliques) vem depois das telas.

## Documentação

- A especificação funcional fica em /docs. Antes de propor qualquer solução, leia a versão de número mais alto.
- Quando este arquivo e a especificação divergirem, este arquivo prevalece até a especificação ser atualizada. Aponte a divergência ao responder.
- A pasta /docs não é commitada: ela deve constar no .gitignore.

## Stack

- Supabase: PostgreSQL, Auth, Storage e Edge Functions.
- Astro com TypeScript e o adaptador da Cloudflare (decisão de 20/10/2026, no lugar do Next.js). Páginas públicas (perfis, categorias, bairros, links curtos de busca) geradas no servidor, para a prévia de links no WhatsApp e para o Google. Partes interativas são scripts pequenos em TypeScript, sem React. Áreas logadas (anunciante, representante, administração) podem ser renderizadas no navegador.
- Hospedagem: Cloudflare Workers Free. As páginas públicas ficam no Workers Cache (acesso em cache não executa o Worker); cada página liga o próprio cache em apps/web/src/lib/cache.ts. Acessos sem cache medidos em 20/10/2026: 6 a 53 ms de processamento, contra o limite de 10 ms do plano.
- Três sites no apps/web/wrangler.jsonc, escolhidos por PUBLIC_AMBIENTE (apps/web/src/lib/ambiente.ts), publicados juntos com `npm run deploy:todos -w web` (decisão de 21/10/2026):
  - produção (Worker "acheaqui"): o site real, com banco e login, em prod.acheaquiro.com.br até a abertura. Em 27/11/2026 passa para acheaquiro.com.br, e prod. redireciona para lá.
  - "em-breve" (Worker "acheaqui-em-breve"): acheaquiro.com.br e www até 26/11/2026, só com o aviso "abre em 27/11". Não acessa o banco. Apagar na abertura.
  - "teste" (Worker "acheaqui-teste"): teste.acheaquiro.com.br, site de apresentação com dados fictícios, sem login e sem acesso ao banco real.
- Hospedagem e serviços externos: somente planos gratuitos que permitam uso comercial. Antes de recomendar um serviço, confira e informe os limites atuais do plano gratuito.

## Arquitetura

- Monorepo com esta estrutura:
  - apps/web: aplicação Astro.
  - packages/types: tipos TypeScript compartilhados.
  - packages/validation: esquemas de validação, usados na tela e no servidor.
  - packages/domain: regras de negócio (ordenação, sorteios, comissão, limites de plano), sem dependência de interface nem de banco.
  - packages/supabase-client: acesso ao Supabase.
  - packages/ui: componentes de interface.
  - supabase/migrations: migrations versionadas.
  - supabase/functions: Edge Functions.
- Domínios, cada um com contrato definido (entradas, saídas e erros): anunciantes e perfis; busca e ordenação; contatos e métricas; planos e cobrança; representantes e comissões; notificações por e-mail; administração.
- Cada domínio começa como módulo isolado. Extraia para serviço independente só quando houver motivo concreto (carga, deploy separado, outra equipe) e justifique a extração.
- Nenhuma regra de negócio duplicada. Antes de escrever código novo, procure algo reaproveitável e diga o que foi reaproveitado.
- Multicidade desde o início: as tabelas de anunciantes, perfis, categorias, bairros, planos contratados e métricas levam a cidade como parte da chave de acesso. No MVP só Rio das Ostras fica visível.
- Valores e limites dos planos e extras (preços, quantidade de fotos, categorias, encartes, produtos) ficam em tabela no banco, editável pela administração, nunca fixos no código. Eles ainda estão em discussão.

## Autenticação e papéis

- Papéis: visitante (sem conta), anunciante, representante, administrador.
- SupraAdmin (decisão de 22/10/2026): sempre um, e só um, administrador marcado como SupraAdmin. Nenhum outro administrador muda o papel dele, o desativa ou retira a marcação. Só o próprio SupraAdmin a transfere para outro administrador ativo, confirmando com o código do aplicativo autenticador, e com isso deixa de ser SupraAdmin (continua administrador). Por isso o sistema nunca fica sem administrador.
- Ações sensíveis da administração (criar, rebaixar ou desativar administrador e transferir o SupraAdmin) pedem de novo o código do aplicativo autenticador, mesmo com a sessão aberta.
- Anunciante, representante e administrador entram com e-mail e senha forte: mínimo de 10 caracteres, com letra maiúscula, letra minúscula, número e símbolo.
- Confirmação do e-mail obrigatória no cadastro. Recuperação de senha por link enviado ao e-mail.
- Limite de tentativas de login e de recuperação de senha, contra força bruta.
- Cadastro assistido (feito pela equipe ou por um representante): o anunciante recebe um link por e-mail para conferir o perfil, aceitar os Termos e a Política de Privacidade e criar a própria senha. O perfil só é publicado depois disso.

## Segurança específica deste projeto

- Row Level Security em todas as tabelas, com política explícita para cada um dos quatro papéis. Visitante só lê perfis publicados e não pausados.
- Uploads de fotos, encartes e logotipos: validar o tipo real do arquivo e o tamanho máximo, e remover metadados de localização das fotos.
- Limite de requisições no cadastro, na denúncia e nos cliques de contato. Cliques repetidos do mesmo visitante no mesmo perfil, em intervalo curto, contam uma vez só, para não inflar as métricas.
- A comparação de médias entre planos só exibe a média de um plano numa categoria com pelo menos 3 anunciantes desse plano.
- LGPD: coletar só os dados previstos na especificação, registrar data e versão do aceite dos Termos e da Política de Privacidade, e permitir a exclusão do cadastro com remoção das fotos no Storage.
- Log de auditoria para ações administrativas: aprovar, recusar, suspender, alterar plano ou extra, marcar Fundador, confirmar ou recusar pagamento por Pix e registrar pagamento de comissão.

## Regras de negócio com testes obrigatórios

Cada regra abaixo fica em packages/domain e tem testes automatizados:

- Ordem da lista de resultados por grupo de plano, com alternância dentro de cada grupo.
- Sorteio dos links patrocinados nas 3 primeiras posições, com peso dobrado para o Patrocinado Plus, considerando o bairro escolhido (pacote de bairros ou cidade toda), com o patrocinado mantido também na posição do seu plano.
- Vaga rotativa a cada 10 posições para os dois planos de entrada, com peso dobrado para o mais caro dos dois (autônomos: Profissional; comércios: Básico).
- Ordenação por distância em "Mais perto de mim", mantendo os patrocinados no topo, e a ordem dos comércios com bairro escolhido (os do bairro primeiro, pelos planos; depois os outros, pela distância ou pelos planos sem localização).
- Cálculo da comissão do representante, no plano mensal e no anual, incluindo os extras vendidos junto com a assinatura.
- Preço do Destaque Exclusivo por dia, com o bloco de 30 dias seguidos e os dias a completar.
- Quem vira Fundador (assinatura anual paga até o prazo) e em quais extras vale o desconto.
- Limites de cada plano e extra.
- Desconto de Fundador e perda da condição de Fundador quando a assinatura vence e não é paga em até 7 dias ou quando a renovação é mensal.
- Vencimento das assinaturas e efeito no perfil (autônomo escondido, comércio no plano Gratuito).

## Forma de trabalhar neste projeto

- Antes de alterar arquivos, mostre o plano e as alterações propostas e aguarde a minha aprovação.
- Toda alteração de banco vira migration versionada em supabase/migrations, nunca alteração manual no painel.
- Ao final de cada entrega, liste os riscos de segurança identificados e como foram tratados.
