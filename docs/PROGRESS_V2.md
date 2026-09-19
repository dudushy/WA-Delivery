# Progresso da implementação — WA-Delivery V2

Última atualização: 2026-09-18

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
- [x] credenciais restauradas pelo armazenamento local do Baileys.

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
- [ ] detalhe, edição e exclusão após salvar;
- [x] importação CSV;
- [x] detecção de delimiter, encoding e coluna de telefone;
- [x] preview das primeiras linhas;
- [x] escolha visual das colunas de telefone e nome;
- [x] análise de válidos, inválidos e duplicados;
- [x] confirmação antes da persistência;
- [x] suporte validado para UTF-8 e Windows-1252.

## Estado dos testes

- 23 testes automatizados aprovados;
- typecheck aprovado;
- build aprovado;
- `npm audit --omit=dev` sem vulnerabilidades conhecidas;
- smoke test de reinício e persistência SQLite aprovado;
- smoke test completo de preview, análise e confirmação CSV aprovado.

## Próximo checkpoint

Detalhe, edição e exclusão das listas, seguidos pelo composer e simulação de campanha.
