# Ache Aqui RO — instruções do projeto

## Sobre o projeto

Site aberto ao público que liga moradores e visitantes de Rio das Ostras a profissionais autônomos e comércios da cidade. O visitante busca e entra em contato sem criar conta; anunciantes, representantes e administradores têm conta com login.

Calendário: pré-cadastro dos Fundadores de 09/11 a 26/11/2026, feito pela equipe e pelos representantes. Abertura ao público e início da cobrança em 27/11/2026 (Black Friday), sem período gratuito: os Fundadores pagam desde a abertura, com o desconto deles.

## Cobrança e representantes

- Na abertura, o pagamento é por Pix, mensal ou anual: o anunciante envia o comprovante pela sua área e a equipe confere e confirma na administração, o que ativa o plano com a validade correspondente. O pagamento automático pelo site (Pix e cartão, com renovação automática) vem depois da abertura.
- Plano vencido sem pagamento: o perfil do autônomo fica escondido, sem ser apagado, e o comércio passa para o plano Gratuito.
- Representantes atuam desde o pré-cadastro dos Fundadores. A comissão é calculada sobre o valor efetivamente pago, já com descontos.

## Documentação

- A especificação funcional fica em /docs. Antes de propor qualquer solução, leia a versão de número mais alto.
- Quando este arquivo e a especificação divergirem, este arquivo prevalece até a especificação ser atualizada. Aponte a divergência ao responder.
- A pasta /docs não é commitada: ela deve constar no .gitignore.

## Stack

- Supabase: PostgreSQL, Auth, Storage e Edge Functions.
- Next.js com TypeScript. Páginas públicas (perfis, categorias, bairros, links curtos de busca) geradas no servidor, para a prévia de links no WhatsApp e para o Google. Áreas logadas (anunciante, representante, administração) podem ser renderizadas no navegador.
- Hospedagem e serviços externos: somente planos gratuitos que permitam uso comercial. Antes de recomendar um serviço, confira e informe os limites atuais do plano gratuito.

## Arquitetura

- Monorepo com esta estrutura:
  - apps/web: aplicação Next.js.
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
- Sorteio dos links patrocinados nas 3 primeiras posições, com peso dobrado para o Patrocinado Plus.
- Vaga rotativa a cada 10 posições para os planos de entrada, com peso dobrado para o Básico.
- Ordenação por distância em "Mais perto de mim", mantendo os patrocinados no topo.
- Cálculo da comissão do representante, no plano mensal e no anual.
- Limites de cada plano e extra.
- Desconto de Fundador e perda da condição de Fundador quando a assinatura vence e não é paga em até 7 dias.
- Vencimento das assinaturas e efeito no perfil (autônomo escondido, comércio no plano Gratuito).

## Forma de trabalhar neste projeto

- Antes de alterar arquivos, mostre o plano e as alterações propostas e aguarde a minha aprovação.
- Toda alteração de banco vira migration versionada em supabase/migrations, nunca alteração manual no painel.
- Ao final de cada entrega, liste os riscos de segurança identificados e como foram tratados.
