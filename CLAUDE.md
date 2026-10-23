# Ache Aqui RO — instruções do projeto

## Sobre o projeto

Site aberto ao público que liga moradores e visitantes de Rio das Ostras a profissionais autônomos e comércios da cidade. O visitante busca e entra em contato sem criar conta; anunciantes, representantes e administradores têm conta com login.

Calendário: pré-cadastro dos Fundadores de 09/11 a 26/11/2026, feito pela equipe e pelos representantes. Abertura ao público e início da cobrança em 27/11/2026 (Black Friday), sem período gratuito. Fundador é quem paga a assinatura anual até 26/11/2026, sem limite de quantidade, e tem desconto nos planos e nos pacotes extras (não nos destaques nem nos links destacados) enquanto continuar Fundador: 50% nos 3 primeiros anos de assinatura e 25% do 4º ano em diante (decisão de 21/10/2026; os percentuais e os anos ficam em tabela no banco). O Selo Verificado, quando existir, é grátis para o Fundador. A renovação do Fundador é sempre anual: quem passa para o mensal, ou não renova em até 7 dias depois do vencimento, deixa de ser Fundador de vez (perde selo, desconto e vitrine). Enquanto Fundador, pode contratar pacotes extras mensais, com o desconto.

## Cobrança e representantes

- Na abertura, o pagamento é por Pix ou cartão na maquininha, mensal ou anual (decisão de 23/10/2026). A equipe registra o pagamento na administração, o que ativa o plano com a validade correspondente; enquanto não houver a área do anunciante, a equipe registra também o Pix que chega pelo WhatsApp. A chave Pix fica em configuracoes (chave_pix): por enquanto, uma chave aleatória de conta pessoal do André, temporária. O pagamento automático pelo site (Pix e cartão, com renovação automática) vem depois da abertura.
- Todo anunciante tem plano (23/10/2026): o comércio começa no Gratuito (o banco preenche o plano em vigor no cadastro) e o autônomo escolhe um plano para se cadastrar.
- Vencimento sempre no mesmo dia do mês (ou do ano), mesmo quando o anunciante paga antes. Depois do vencimento, 7 dias para pagar; a administração mostra um card com os anunciantes em atraso dentro desses 7 dias.
- Plano vencido sem pagamento (passados os 7 dias): o perfil do autônomo fica escondido, sem ser apagado, e o comércio passa para o plano Gratuito.
- Devolução: o anunciante pode desistir em até 7 dias depois do primeiro pagamento de uma contratação, com o dinheiro devolvido. Por isso toda comissão fica "aguardando 7 dias" depois da confirmação de qualquer pagamento (regra única, mais simples de explicar) e só então é liberada para pagamento ao representante; pagamento devolvido cancela a comissão dele.
- Representantes atuam desde o pré-cadastro dos Fundadores. A comissão é calculada sobre o valor efetivamente pago, já com descontos, e vai para o representante que atendeu aquela venda (não necessariamente o que trouxe o anunciante). No plano, 135% de uma mensalidade (mensal: 100%, 20%, 10% e 5% das 4 primeiras; anual: de uma vez, sem nova comissão na renovação). Extras vendidos com o atendimento do representante, junto com a assinatura ou depois: 20% do valor pago pelo extra nessa venda, uma vez só.
- Upgrade com o atendimento de um representante (decisões de 23/10/2026): comissão de 135% da diferença das mensalidades, nas mesmas parcelas (mensal) ou de uma vez (anual), sobre o maior plano que já gerou comissão para aquele anunciante (descer e subir de novo não gera comissão nova). O plano muda na hora e o anunciante paga a diferença proporcional ao tempo que falta no período. Qualquer representante pode atender, inclusive anunciante que entrou sem representante. Mudança feita pelo próprio anunciante, sem atendimento, não gera comissão para ninguém.
- Toda venda de representante precisa do aceite do anunciante (link por e-mail) antes do pagamento.
- Representante: verificação em duas etapas obrigatória; aceite de um termo de confidencialidade no primeiro acesso (ele vê o telefone e o e-mail da Receita dos comércios importados); a chave Pix dele é informada por ele mesmo, com a troca na auditoria. Não há reserva de comércio na prospecção.
- Destaque Exclusivo: vendido por dia, escolhido num calendário com os dias livres e ocupados. Diária e bloco de 30 dias seguidos ficam em extras.regras; a partir de 21 dias seguidos, o anunciante paga o bloco e os dias que faltam vão para os próximos dias livres (pode cancelá-los, sem devolução). Reserva com pelo menos 2 dias de antecedência, valendo a partir do dia seguinte à confirmação do Pix. Uma tarefa à meia-noite limpa o cache das páginas.
- Link destacado: pacote de 3 bairros ou cidade toda (no máximo 3 por categoria). Sem bairro escolhido pelo visitante, só os da cidade toda disputam o topo. Na aba Comércios, o bairro escolhido reordena em vez de esconder: os do bairro primeiro, depois os outros pela distância (com a localização do celular) ou pelos planos. O destacado continua também na posição do seu plano. Super Destaque: ordem sorteada a cada visita.

## Comércios importados da Receita

- Decisão de 22/10/2026, para abrir com a base cheia: os comércios de Rio das Ostras vêm dos dados abertos do CNPJ da Receita Federal (scripts/importar-cnpj). Não usar a API do Google Places: os termos de uso proíbem guardar o conteúdo e montar diretório com ele. O link "Como chegar" para o Google Maps continua.
- Entram só CNPJs ativos. Ficam de fora MEI, empresário individual (natureza 213-5), órgão público e os CNAEs sem atendimento ao público (tabela cnae_categoria com categoria vazia, editável na administração).
- O importado entra publicado, no plano Gratuito, com origem "receita", sem aceite dos Termos (exceção à regra do cadastro assistido) e com uma categoria só (limite do Gratuito). Nome, endereço, bairro, mapa e categoria aparecem; telefone, e-mail e razão social da Receita não são publicados e ficam em dados_receita, só para a administração e os representantes.
- A página do importado tem "É seu? Assuma este perfil", "Remover meu comércio" e "Informar que fechou" (pedidos_perfil). Assumir segue o fluxo do cadastro assistido.
- Atualização mensal pela Receita: em aberto.

## Patrocinadores e Agenda

- Nomes (decisão de 22/10/2026): "Patrocinador" é só a empresa que apoia o site como marca. O extra que põe o anunciante nas 3 primeiras posições da lista é o "Link destacado" (e o "Destacado Plus"), com o selo "Destaque" no card. Não usar "patrocinado" para o extra.
- Patrocinadores (proposta Patrocinadores v3, em docs/Comercial/Patrocinadores, ainda em discussão): empresas que apoiam o site como marca, sem perfil na lista e sem mudar a ordem dela. Cotas por 12 meses: Master (1 vaga), Ouro (3), Apoio (6), Grupo de categorias (1 por grupo), Categoria (1 por categoria, só quem não concorre com os anunciantes dela) e Agenda (1). Preço de Patrocinador Fundador para contrato fechado até 26/11/2026. Exclusividade de ramo em todas as cotas, menos Apoio. Pix à vista, sem renovação automática, sem patrocínio político nem de apostas. Comissão do representante que atendeu (decisão de 23/10/2026): 20% do valor pago pelo contrato, de uma vez, depois dos 7 dias da devolução; contrato novo só gera comissão com novo atendimento; troca de cota no meio do contrato, 20% da diferença paga; patrocinador que procurou a equipe sozinho não gera comissão. Cotas, vagas, valores e benefícios ficam em tabela no banco.
- Onde aparecem: faixa "Oferecimento" no rodapé de todas as páginas (no computador, três colunas: Master com logo quadrado, os 3 Ouro com logo comprido um embaixo do outro e os 6 Apoio dois por linha, sem revezamento; no celular, uma parte embaixo da outra), a página /patrocinadores, o "patrocinado por" ao lado do grupo (na trilha de navegação) e da categoria, e ao lado do título da Agenda. Só o nome do patrocinador é link. Contato pelo endereço /p/[slug], com rel="sponsored". Nada aparece sem pelo menos 1 patrocinador ativo. O tamanho do logo de cada cota fica em FORMATOS_LOGO_PATROCINIO (packages/domain) e é mostrado na administração.
- Página /patrocine, aberta a todos (decisão de 22/10/2026): cotas, benefícios, valor por 12 meses e de Fundador (até o prazo de Fundador), vagas livres de cada cota (grupo e categoria: uma vaga por grupo e por categoria do catálogo; cota esgotada mostra "Nova vaga aberta a partir de" o dia seguinte ao fim do contrato que vence primeiro, regra novaVagaAPartirDe em packages/domain; no site de apresentação os patrocinadores fictícios não ocupam vaga), tamanho do logo e as regras, com o botão de contato, para vender a qualquer empresa, inclusive pela internet.
- Artistas (decisão de 22/10/2026): o artista ou a banda que quer perfil completo vira anunciante (categoria "Músicos e bandas"), sem papel novo. Só o artista anunciante mostra foto, capa, descrição, fotos, vídeos, redes, telefone e qualquer outra informação; o que não é anunciante aparece só quando um comércio o cadastra na própria agenda, e então só com nome e estilo (dadosPublicosDoArtista, em packages/domain), com o convite "É você? Anuncie".
- Página da categoria: o título na tela é só a categoria ("Pizzarias"), porque o site é só da cidade; o título da aba e a prévia continuam com o nome da cidade, por causa do Google (decisão de 22/10/2026).
- Agenda (módulo de eventos, decisões de 21 e 22/10/2026): /agenda com calendário mensal (navega para frente e para trás pelos meses; a página leva pronto de 1 mês antes a 3 meses depois do atual, e os outros meses o navegador busca em /agenda/mes, também guardado no cache), filtro de bairro, busca por artista e filtro por artista pelo endereço /agenda?artista=slug (com aviso e botão para tirar o filtro); /agenda/[evento] com a programação e as barracas; /artista/[slug] é o perfil completo do artista ou da banda (fotos, vídeos como link externo, formação, tipos de evento, botão de contratar pelo WhatsApp, um card "Shows" com os próximos e o link "Ver agenda completa", que abre a Agenda filtrada pelo artista; o "Contratar" não diz "direto" nem "sem intermediários", porque o contato pode ser do empresário); /artistas lista todos, com busca por nome ou estilo; seção Agenda no perfil do comércio com o extra de Agenda, em faixa com os dias que cabem na largura da tela (de 5 a 14, sem barra de rolagem), com setas que andam essa quantidade (o calendário do mês ocupa espaço demais ali).
- Produção dos patrocinadores (22/10/2026): tabelas cotas_patrocinio, patrocinios, pagamentos_patrocinio (valor pago, só o administrador lê) e cliques_patrocinio (migration 20261022170000_patrocinadores.sql), com RLS para os quatro papéis e auditoria. O banco repete as travas: vagas da cota, uma empresa por grupo, por categoria e por ramo na mesma cota (menos Apoio). Regras em packages/domain/patrocinio.ts, com testes: prazo de 12 meses (fimDoPatrocinio), dias somados por site fora do ar por mais de 3 dias seguidos, preço de Fundador até o prazo, impedimento para entrar no ar e nova vaga. Tela em /admin/patrocinadores: cotas e valores, cadastro, logo (convertido no navegador para WebP no tamanho exato da cota e conferido no servidor; SVG recusado), entrada no ar, pagamento, dias somados, encerramento. O site da produção lê do banco e só mostra patrocinador no ar e dentro do prazo; clique em /p/[slug] contado uma vez por visitante a cada 30 minutos, com um resumo do visitante que não guarda o IP.
- Agenda e artistas continuam só no site de apresentação, com dados fictícios (bares com Agenda: Quiosque Maré Cheia e Boteco da Praça).

## Contato

- Todos os botões de contato com a equipe (Quero anunciar, Quero ser Fundador, Quero ser representante, Quero patrocinar, Quero esta cota) abrem o WhatsApp da equipe, +55 21 98852-0666 (WHATSAPP_EQUIPE em apps/web/src/lib/contato.ts), com uma mensagem pronta que diz de onde veio o contato (decisão de 22/10/2026).

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
- Sorteio dos links destacados nas 3 primeiras posições, com peso dobrado para o Destacado Plus, considerando o bairro escolhido (pacote de bairros ou cidade toda), com o destacado mantido também na posição do seu plano.
- Vaga rotativa a cada 10 posições para os dois planos de entrada, com peso dobrado para o mais caro dos dois (autônomos: Profissional; comércios: Básico).
- Ordenação por distância em "Mais perto de mim", mantendo os destacados no topo, e a ordem dos comércios com bairro escolhido (os do bairro primeiro, pelos planos; depois os outros, pela distância ou pelos planos sem localização).
- Cálculo da comissão do representante, no plano mensal e no anual, incluindo os extras vendidos com o atendimento dele, o upgrade (diferença sobre o maior plano já comissionado), o patrocínio e a espera de 7 dias para liberar a comissão.
- Valor proporcional do upgrade no meio do período (mensal e anual).
- Preço do Destaque Exclusivo por dia, com o bloco de 30 dias seguidos e os dias a completar.
- Quem vira Fundador (assinatura anual paga até o prazo) e em quais extras vale o desconto.
- Limites de cada plano e extra.
- Desconto de Fundador e perda da condição de Fundador quando a assinatura vence e não é paga em até 7 dias ou quando a renovação é mensal.
- Vencimento das assinaturas e efeito no perfil (autônomo escondido, comércio no plano Gratuito).

## Forma de trabalhar neste projeto

- Antes de alterar arquivos, mostre o plano e as alterações propostas e aguarde a minha aprovação.
- Toda alteração de banco vira migration versionada em supabase/migrations, nunca alteração manual no painel.
- Ao final de cada entrega, liste os riscos de segurança identificados e como foram tratados.
