# Progresso da implementação — WA-Delivery V2

Última atualização: 2026-09-19

## Concluído

### Fase 0 — baseline e Baileys

- [x] TypeScript + ESM;
- [x] Node.js 24.14.0 no `.nvmrc`;
- [x] Baileys 7.0.0-rc14 fixado no lockfile;
- [x] adapter `WhatsAppProvider`;
- [x] QR Code pela interface web;
- [x] persistência da sessão em `data/sessions/baileys`;
- [x] reconexão e tratamento de logout;
- [x] métodos de validação, texto, imagem e vídeo;
- [x] conexão real validada pelo usuário em 2026-09-18;
- [x] credenciais restauradas pelo armazenamento local do Baileys;
- [x] reconexão automática ao iniciar quando já existe sessão salva (`hasSavedSession`),
  sem forçar novo QR Code.

### Fase 1 — shell local

- [x] servidor Fastify restrito a `127.0.0.1`;
- [x] health check;
- [x] interface local de conexão;
- [x] atualização de estado por SSE;
- [x] shutdown gracioso;
- [x] SQLite local via `node:sqlite`;
- [x] migrations versionadas;
- [x] persistência em `data/database/wa-delivery.db`.

### Fase 2 — contatos

- [x] cadastro manual de listas;
- [x] inclusão e remoção de linhas antes de salvar;
- [x] normalização de telefone;
- [x] validação de nome, telefone e duplicidade;
- [x] listagem de listas salvas;
- [x] persistência validada após reinício;
- [x] detalhe, edição e exclusão após salvar;
- [x] importação CSV;
- [x] detecção de delimiter, encoding e coluna de telefone;
- [x] preview das primeiras linhas;
- [x] escolha visual das colunas de telefone e nome;
- [x] análise de válidos, inválidos e duplicados;
- [x] confirmação antes da persistência;
- [x] suporte validado para UTF-8 e Windows-1252;
- [x] página de contatos organizada em abas "Importar CSV" e "Adicionar manualmente".

### Fase 3 — criação e simulação de campanha

- [x] composer com nome, lista, mensagem, variável `{{nome}}`, mídia e intervalos;
- [x] simulação com contagem de destinatários, duração e prévia personalizada;
- [x] snapshot imutável dos destinatários no preparo;
- [x] confirmação explícita antes de preparar/iniciar;
- [x] prévia preserva quebras de linha da mensagem (`white-space: pre-wrap`).

### Fase 4 — fila de disparos resiliente (em andamento)

- [x] fila persistente processada por um único worker;
- [x] intervalo aleatório dentro da faixa configurada;
- [x] pause, resume e cancelamento;
- [x] bloqueio contra duas campanhas simultâneas;
- [x] recuperação após reinício (itens em `sending` viram `failed`, sem reenvio silencioso);
- [x] progresso via SSE e registro de cada tentativa;
- [x] **checkpoint 1 — timeout e classificação de erros**:
  - timeout configurável em todas as operações do `WhatsAppProvider`
    (`isRegisteredNumber`, `sendText`, `sendMedia`), default 30s;
  - classificação de erros em transitórios e permanentes (`classifyError`);
  - a categoria é registrada como prefixo (`[transient]` / `[permanent]`) no
    `last_error` do destinatário.
- [ ] checkpoint 2 — retry apenas para falhas transitórias, com limite;
- [ ] checkpoint 3 — backoff controlado entre tentativas;
- [ ] checkpoint 4 — tratamento reforçado de desconexão/reconexão durante a fila;
- [ ] checkpoint 5 — idempotência adicional após reinício.

## Ciclo de vida da campanha (comportamento atual)

Estados: `draft -> ready -> running -> paused -> completed/cancelled/failed`.

- **Editável somente em `draft`.** `ready`, `running` e `paused` não são editáveis.
- **Exclusão** permitida em qualquer estado **exceto `running`** (com confirmação na
  interface). Excluir remove destinatários e tentativas em cascata.
- **Reenvio (follow-up)**: a partir de uma campanha finalizada
  (`completed`/`cancelled`/`failed`), o usuário pode criar uma **nova campanha**
  contendo **apenas os destinatários pendentes** (status `failed` e `skipped`). Os
  destinatários `sent` são preservados na campanha original como histórico e não são
  reenviados. A nova campanha nasce já preparada (`ready`) e vinculada à origem por
  `source_campaign_id`; a interface exibe o vínculo "campanha de origem #N".
- **Confirmação de envio**: o checkbox "Entendo que esta ação enviará mensagens reais"
  aparece apenas no estado `ready`; ao iniciar, ele some e a interface indica
  "Campanha em execução".

## Banco de dados

- Migration atual: **versão 6**.
- v6 adiciona `campaigns.source_campaign_id` (nullable, `ON DELETE SET NULL`) para o
  vínculo de reenvio. Todas as migrations são incrementais e compatíveis com banco
  já populado; há teste de upgrade para a v5 e para a v6 sobre dados existentes.

## Estado dos testes

- 64 testes automatizados aprovados;
- typecheck aprovado;
- build aprovado;
- `npm audit --omit=dev` sem vulnerabilidades conhecidas;
- testes de upgrade de migration (v5 e v6) sobre banco populado aprovados;
- fila coberta por `FakeWhatsAppProvider` (nenhuma conta real é usada nos testes).

## Próximo checkpoint

Fase 4 — checkpoint 2: retry apenas para falhas transitórias, com limite de
tentativas, aproveitando a classificação de erros já implementada.
