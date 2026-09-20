# Plano de implementação — WA-Delivery V2

## Objetivo

Evoluir o WA-Delivery para uma aplicação local, simples para usuários não técnicos, mantendo o envio gratuito por uma integração não oficial com o WhatsApp.

A V2 usará Node.js, TypeScript, Baileys, interface web em localhost e persistência local, sem Docker, Chrome, Puppeteer ou serviços externos obrigatórios.

> O Baileys é uma integração não oficial. O isolamento por provider reduz o impacto de futuras quebras, mas não elimina riscos de incompatibilidade ou restrição da conta pelo WhatsApp.

## Princípios

- execução local e single-user;
- instalação reproduzível com Node.js e npm;
- nenhuma dependência de infraestrutura externa;
- configuração pela interface, sem edição manual de JSON;
- campanhas sempre revisadas antes do envio;
- estado persistente e recuperação segura após reinício;
- Baileys isolado atrás de uma interface própria;
- versões críticas fixadas no lockfile;
- migração incremental, com entregas pequenas e testáveis;
- dados sensíveis, sessões, banco e mídias fora do Git.

## Arquitetura-alvo

```text
Browser (localhost)
        |
     HTTP + SSE
        |
Node.js + TypeScript
  |-- Web UI
  |-- REST API
  |-- Importação e validação
  |-- Campanhas e fila
  |-- Relatórios
  |-- WhatsAppProvider
  |      `-- BaileysWhatsAppProvider
  |
SQLite + arquivos locais
```

O domínio de contatos, campanhas, fila e relatórios não deve depender diretamente do Baileys.

## Estrutura inicial proposta

```text
src/
  app/
  config/
  database/
  modules/
    contacts/
    campaigns/
    deliveries/
    media/
    settings/
    whatsapp/
  providers/
    whatsapp/
      WhatsAppProvider.ts
      baileys/
  web/
    api/
    ui/
  shared/
tests/
data/
  database/
  media/
  sessions/
docs/
```

A estrutura poderá ser ajustada durante o bootstrap, desde que a separação entre domínio, infraestrutura e UI seja preservada.

## Modelo de dados inicial

- `settings`: configurações operacionais;
- `contacts`: contatos normalizados e seus dados importados;
- `contact_lists`: listas/importações;
- `contact_list_members`: associação entre contatos e listas;
- `campaigns`: definição, configuração e estado da campanha;
- `campaign_recipients`: snapshot dos destinatários e status individual;
- `delivery_attempts`: tentativas, resposta do provider, erro e timestamps;
- `media`: metadados dos arquivos locais;
- metadados da sessão do WhatsApp, mantendo as credenciais criptográficas em armazenamento próprio do provider.

## Estados mínimos

### Conexão do WhatsApp

`disconnected -> connecting -> qr_pending -> connected -> reconnecting/error`

### Campanha

`draft -> ready -> running -> paused -> completed/cancelled/failed`

### Destinatário

`pending -> processing -> sent/failed/skipped`

Ao reiniciar a aplicação, itens que ficaram em `processing` não podem ser reenviados silenciosamente. Eles devem voltar para um estado recuperável com registro da interrupção.

---

## Fase 0 — baseline técnico e prova de conceito

### Entregas

- confirmar a versão LTS do Node.js suportada e ajustar `.nvmrc`;
- migrar o projeto para TypeScript e definir ESM/CommonJS de forma compatível com o Baileys escolhido;
- fixar uma versão exata do Baileys após teste real;
- configurar build, desenvolvimento, lint, format e testes;
- criar `WhatsAppProvider` e os tipos do domínio;
- implementar uma prova de conceito isolada:
  - gerar QR Code;
  - persistir e restaurar sessão;
  - reconectar;
  - validar um número;
  - enviar uma mensagem de texto;
  - enviar uma imagem e um vídeo;
- documentar limitações observadas;
- garantir que credenciais e dados locais estejam no `.gitignore`.

### Critério de conclusão

Uma sessão sobrevive ao reinício e os envios de teste funcionam sem Chrome/Puppeteer. Nenhuma feature antiga é removida antes dessa validação.

## Fase 1 — shell da aplicação e persistência

### Entregas

- criar o servidor HTTP local;
- criar o shell da interface web;
- adicionar banco SQLite e migrations versionadas;
- implementar configurações persistentes;
- criar endpoint de saúde;
- expor estado da conexão por API e SSE;
- exibir QR Code e estado de conexão na interface;
- implementar shutdown gracioso.

### Critério de conclusão

A aplicação inicia por um único comando, abre em localhost, conecta o WhatsApp pela GUI e restaura sessão e configurações após reinício.

## Fase 2 — importação e gerenciamento de contatos

### Entregas

- upload de CSV, incluindo exportações do Google Contacts;
- cadastro manual de contatos para quem não possui arquivo de importação;
- formulário manual com nome e telefone, validação imediata e inclusão de vários contatos;
- edição e remoção de contatos adicionados manualmente antes de salvar a lista;
- detectar delimiter, encoding e headers;
- mostrar tabela de preview antes de persistir;
- sugerir colunas prováveis de telefone;
- permitir selecionar visualmente a coluna usada;
- preservar as demais colunas para personalização;
- normalizar telefones com país/DDD configuráveis;
- identificar inválidos e duplicados;
- permitir corrigir, ignorar ou excluir registros;
- persistir listas e contatos;
- mostrar resumo da importação.

### Critério de conclusão

O usuário consegue criar uma lista digitando nomes e telefones manualmente ou importar um CSV. Na importação, escolhe a coluna de telefone vendo dados reais e recebe totais confiáveis de válidos, inválidos e duplicados antes de salvar.

## Fase 3 — criação e simulação de campanha

### Entregas

- wizard para criar campanha;
- selecionar lista de contatos;
- editor de texto;
- suporte a variáveis, por exemplo `{{nome}}`;
- upload e preview de imagem ou vídeo;
- configuração de intervalo mínimo e máximo;
- validação de campos ausentes;
- preview por contato;
- simulação com:
  - total importado;
  - duplicados;
  - inválidos;
  - ignorados/opt-outs;
  - total previsto;
  - duração mínima, máxima e estimada;
- confirmação explícita antes de iniciar.

### Critério de conclusão

Nenhuma campanha é iniciada sem um snapshot dos destinatários e uma tela final de revisão.

## Fase 4 — fila de disparos resiliente

### Entregas

- fila persistente processada por um único worker;
- intervalo aleatório dentro da faixa configurada;
- pause, resume e cancelamento;
- bloqueio contra duas campanhas simultâneas;
- tratamento de desconexão e reconexão;
- timeouts e classificação de erros;
- retry apenas para falhas transitórias e com limite;
- idempotência para reduzir duplicidade após reinício;
- eventos de progresso via SSE;
- registro de cada tentativa.

### Critério de conclusão

Uma campanha pode ser pausada e retomada, sobrevive a reinício controlado e não perde o histórico de cada destinatário.

> Intervalo e jitter são controles operacionais; não garantem proteção contra bloqueio. Contatos devem ter consentido com as mensagens, e pedidos de opt-out devem ser respeitados.

## Fase 5 — monitoramento, histórico e relatórios

### Entregas

- dashboard da campanha atual;
- progresso, enviados, falhas, ignorados e pendentes;
- tempos decorrido e restante estimado;
- detalhe por destinatário;
- histórico de campanhas;
- filtros por status;
- exportação CSV completa e somente falhas;
- logs estruturados com mascaramento de dados sensíveis;
- política simples de retenção/limpeza.

### Critério de conclusão

O usuário consegue explicar o resultado de cada campanha e exportar uma lista acionável de falhas.

## Fase 6 — experiência de instalação e operação

### Entregas

- atualizar `RUN.bat` (instala/compila na primeira execução);
- abrir a interface automaticamente no navegador padrão;
- validar Node/npm antes de iniciar;
- mensagens de erro amigáveis;
- guia de primeiro uso;
- backup e restauração dos dados locais;
- documentação de atualização segura;
- documentação de solução de problemas;
- remover dependências e configurações legadas de Chrome/Puppeteer somente após equivalência funcional.

### Critério de conclusão

Um usuário não técnico consegue instalar, conectar o WhatsApp, importar contatos, simular uma campanha, enviar e consultar o relatório seguindo apenas a interface e o guia.

## Fase 7 — qualidade e preparação da V2

### Entregas

- testes unitários de normalização, template, estimativa e transições de estado;
- testes de integração do banco, API, importador e fila;
- testes do adapter Baileys com limites bem definidos e mocks onde necessário;
- smoke test no Windows;
- validar caminhos com espaços e caracteres acentuados;
- auditoria de arquivos sensíveis no Git;
- atualizar README e changelog;
- checklist de release e estratégia de rollback.

### Critério de conclusão

Build, lint e testes passam; o fluxo principal foi validado no Windows; nenhum segredo, sessão, banco ou mídia de usuário está versionado.

---

## Sequência recomendada de branches/PRs

1. `feat/v2-bootstrap-typescript`
2. `feat/v2-baileys-provider`
3. `feat/v2-local-api-database`
4. `feat/v2-whatsapp-connection-ui`
5. `feat/v2-contact-import`
6. `feat/v2-campaign-composer`
7. `feat/v2-delivery-queue`
8. `feat/v2-monitoring-reports`
9. `feat/v2-windows-ux-docs`

A branch `feat/v2-baileys-local-web-app` funciona como branch de integração da V2. Cada branch curta deve nascer dela e retornar por PR. A `main` permanece estável até a V2 atingir os critérios de release.

## Fora do escopo inicial

- Meta WhatsApp Cloud API;
- integração direta com Google People API/OAuth;
- Docker;
- PostgreSQL, Redis, RabbitMQ ou serviços em nuvem;
- múltiplos usuários ou múltiplas contas de WhatsApp;
- aplicação mobile;
- agendamento recorrente de campanhas;
- respostas automáticas/chatbot;
- mecanismos que prometam evitar bloqueios;
- merge ou reaproveitamento da branch `feat/meta-cloud-api-local-ui`.

## Decisões que serão fechadas na Fase 0

- versão exata do Node.js;
- versão exata do Baileys;
- biblioteca SQLite;
- framework HTTP;
- estratégia da UI;
- biblioteca de parsing CSV;
- formato de migrations;
- diretório local de dados por sistema operacional.

Essas escolhas devem considerar compatibilidade, manutenção, footprint, experiência no Windows e facilidade de empacotamento. Não serão adicionadas abstrações ou serviços externos sem benefício demonstrável.

## Definition of Done por PR

- escopo pequeno e relacionado a uma fase;
- código tipado e sem dependência direta do Baileys fora do adapter;
- build, lint e testes passando;
- migrations compatíveis com banco existente;
- erros e logs sem tokens ou credenciais;
- documentação ajustada quando o comportamento mudar;
- passos de validação manual descritos no PR;
- sem alterações oriundas da branch da Meta API.
