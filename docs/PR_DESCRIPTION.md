# WA-Delivery V2 — 2.0.0-rc.1

## Resumo funcional

Evolui o WA-Delivery para uma aplicação **local** em Node.js + TypeScript com
interface web em `localhost`, usando **Baileys** (integração não oficial) e
**SQLite**, sem Docker, Chrome/Puppeteer ou serviços externos. Toda a
configuração é feita pela interface (o `config.json` da V1 foi removido).

Fluxo: conectar o WhatsApp por QR, importar/cadastrar contatos, montar e simular
campanhas, confirmar o envio real, monitorar em tempo real, exportar relatórios e
fazer backup/restauração — tudo local.

## Arquitetura

```text
Browser (localhost) ──HTTP + SSE── Node.js + TypeScript
  ├─ Web UI (public/) + REST/SSE (src/web)
  ├─ Domínio (src/modules): contacts, campaigns, media, queue, settings, backup
  ├─ WhatsAppProvider ─ BaileysWhatsAppProvider (Baileys isolado)
  └─ SQLite (node:sqlite) + arquivos locais (data/)
```

O domínio não depende diretamente do Baileys (isolado atrás do `WhatsAppProvider`).

## Migrations

- Schema **v9**. Novas nesta entrega: v8 (`settings`) e v9 (`contacts.opted_out`).
- Todas incrementais, em transação, compatíveis com banco populado; testes de
  upgrade para v5, v6, v7 e v9.

## Testes automatizados

- **127 testes** (test runner do Node, `FakeWhatsAppProvider` — nunca conecta
  conta real).
- Cobertura acima dos limiares (linhas ~91%, funções ~87%, branches ~76%).
- `npm run check` = typecheck + lint (ESLint flat, TS/ESM) + format:check
  (Prettier) + testes + build.

## Testes manuais (pendentes de execução pelo usuário)

Ver `docs/PHASE_0_MANUAL_VALIDATION.md` e `docs/RELEASE_CHECKLIST.md`. Usar uma
lista apenas com o próprio número: texto/imagem/vídeo, pausa/retomada/cancelamento,
desconexão/reconexão, reinício, follow-up, relatórios, backup/restauração;
Windows nativo e WSL.

## Riscos do Baileys

Integração **não oficial**: pode quebrar com atualizações do WhatsApp e há risco
de restrição/bloqueio da conta. Nenhum recurso promete evitar bloqueios. Uso
apenas com contatos que consentiram; opt-out respeitado.

## Instalação

- Windows: `RUN.bat` (duplo clique ou terminal; instala/compila na 1ª vez).
- Linux/WSL: `./run.sh` (instala/compila na 1ª vez).
- Detalhes em `docs/INSTALLATION.md`.

## Backup e rollback

- Backup em arquivo único `.wabkp` pela interface (banco + mídias + sessão).
- Restauração validada (versão + checksums), atômica com rollback e reinício.
- Atualização preserva `data/`. Ver `docs/BACKUP_RESTORE.md`.

## Breaking changes da V1

- Removidos `src/index.js`, `src/utils/load*.js` e `config.json`
  (baseados em `whatsapp-web.js`/Puppeteer). A configuração agora é pela UI.

## Checklist de segurança

- SQL 100% parametrizado; frontend escapa saída (XSS); binding só em `127.0.0.1`.
- Uploads com limite e validação de MIME/magic bytes; mídia servida por id.
- Backup com proteção contra path traversal e checksums.
- CSV formula injection neutralizado na exportação.
- Erros sem stack trace ao usuário; logs mascaram telefones e não registram
  credenciais/mensagens. `npm audit`: 0 vulnerabilidades. Ver `docs/SECURITY_AUDIT.md`.

## Pendências conhecidas

- Validação manual com WhatsApp real (acima) ainda não executada.
- Screenshots não versionados (instruções no README para adicioná-los).

> **Não fazer merge automaticamente.** Este é um release candidate para revisão.
