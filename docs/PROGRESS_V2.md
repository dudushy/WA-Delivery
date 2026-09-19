# Progresso da implementação — WA-Delivery V2

Última atualização: 2026-09-19 (Fases 4 e 5 concluídas)

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

### Fase 4 — fila de disparos resiliente

- [x] fila persistente processada por um único worker;
- [x] intervalo aleatório dentro da faixa configurada;
- [x] pause, resume e cancelamento;
- [x] bloqueio contra duas campanhas simultâneas;
- [x] progresso via SSE e registro de cada tentativa;
- [x] **checkpoint 1 — timeout e classificação de erros**:
  - timeout configurável em todas as operações do `WhatsAppProvider`
    (`isRegisteredNumber`, `sendText`, `sendMedia`), default 30s;
  - classificação de erros em transitórios e permanentes (`classifyError`);
  - a categoria é registrada como prefixo (`[transient]` / `[permanent]`) no
    `last_error` do destinatário.
- [x] **checkpoint 2 — retry apenas para falhas transitórias, com limite**:
  - falhas transitórias são reprocessadas até `DEFAULT_MAX_ATTEMPTS` (3);
  - falhas permanentes, desconexão ou limite atingido resultam em `failed`;
  - `error_kind` persistido em `delivery_attempts` (migration v7).
- [x] **checkpoint 3 — backoff controlado entre tentativas**:
  - backoff exponencial `base * 2^(tentativa-1)` limitado por um teto,
    interrompível por pausa/cancelamento.
- [x] **checkpoint 4 — desconexão e reconexão durante a fila**:
  - detecção proativa da queda (antes de consumir tentativas);
  - retomada automática ao reconectar; pausas manuais não são retomadas.
- [x] **checkpoint 5 — idempotência após reinício**:
  - `recoverInterrupted` idempotente: `sending` → `failed` (interrompido),
    `sent` preservado, `running` → `paused`; sem reenvio silencioso.

### Fase 5 — monitoramento, histórico e relatórios

- [x] progresso da campanha (total, enviados, falhas, ignorados, pendentes);
- [x] detalhe por destinatário: status, tentativas, último erro e data de envio;
- [x] filtro por status na página da campanha, com atualização em tempo real (SSE);
- [x] histórico de campanhas na listagem, com rótulo de status;
- [x] exportação CSV completa e somente falhas (`/api/campaigns/:id/export`),
  com escape RFC 4180;
- [x] campanhas de reenvio (follow-up) vinculadas à origem preservam o histórico.

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

- Migration atual: **versão 7**.
- v6 adiciona `campaigns.source_campaign_id` (nullable, `ON DELETE SET NULL`) para o
  vínculo de reenvio.
- v7 adiciona `delivery_attempts.error_kind` (`transient`/`permanent`) para
  rastrear a classificação de cada tentativa.
- Todas as migrations são incrementais e compatíveis com banco já populado; há
  testes de upgrade para as versões 5, 6 e 7 sobre dados existentes.

## Estado dos testes

- 78 testes automatizados aprovados;
- typecheck aprovado;
- build aprovado;
- `npm audit --omit=dev` sem vulnerabilidades conhecidas;
- testes de upgrade de migration (v5, v6 e v7) sobre banco populado aprovados;
- fila coberta por `FakeWhatsAppProvider` (nenhuma conta real é usada nos testes).

## Próximo checkpoint

Fase 6 — experiência de instalação e operação (scripts, guia de primeiro uso,
backup/restauração), seguida da Fase 7 (qualidade e preparação da release).
