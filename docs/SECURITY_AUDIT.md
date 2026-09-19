# Auditoria de segurança — WA-Delivery V2

Aplicação **local, single-user**, servida apenas em `127.0.0.1`. A auditoria foca
no cenário local; não há autenticação porque não há exposição de rede nem
multiusuário (adicionar auth aqui não traria benefício concreto).

Data da auditoria: 2026-09-19. Escopo: código atual da branch
`feat/v2-baileys-local-web-app`.

## Itens verificados

| Item | Situação | Observação |
|------|----------|------------|
| Exposição de rede | OK | Fastify escuta apenas em `127.0.0.1:3000`. |
| Uploads multipart | OK | Limite global de 64 MB e 1 arquivo por requisição. |
| Tamanho máximo de mídia | OK | Imagem 10 MB, vídeo 64 MB, revalidado no `MediaService`. |
| MIME + magic bytes | OK | `MediaService` valida assinatura (JPEG/PNG/WEBP/MP4). |
| Path traversal (mídia) | OK | Servida por id numérico; nome de armazenamento é UUID. |
| Path traversal (backup) | OK | `assertSafeRelPath` bloqueia `..`, absolutos e roots fora de database/media/sessions. |
| CSV malformado | OK | Detecção de delimiter, limite de 20.000 linhas, erros tratados. |
| **CSV formula injection** | **Corrigido** | `csvCell` prefixa `'` em valores iniciados por `= + - @` (tab/CR). |
| XSS no frontend | OK | Dados de usuário passam por `escapeHtml`/`escapeAttribute` ou `textContent`. |
| `innerHTML` | OK | Usado apenas com conteúdo estático ou já escapado. |
| SQL injection | OK | Todas as queries usam `prepare(...).run/get/all` com parâmetros. |
| Limites de payload | OK | Multipart 64 MB; backup 512 MB (arquivo local do próprio usuário). |
| SSE encerrado corretamente | OK | `request.raw.once('close')` cancela as inscrições de estado e progresso. |
| Erros não tratados | OK | `setErrorHandler`: 5xx genérico + log mascarado; 4xx preserva mensagem, sem stack trace. |
| Shutdown durante envio | OK | `queue.shutdown()` volta `running` → `paused`; recuperação idempotente ao reiniciar. |
| Concorrência worker/backup/restore | OK | Restauração para o worker (`beforeRestore`) e exige reinício. |
| Logs com telefone/mensagem/credencial | OK | `logger` mascara telefones; nunca loga conteúdo de mensagem nem credenciais. |
| Permissões do diretório de sessão | Informativo | Sessão fica em `data/sessions/` (ignorada pelo Git); backup avisa que é sensível. |
| Dependências vulneráveis | OK | `npm audit` e `npm audit --omit=dev`: 0 vulnerabilidades. |
| Dados sensíveis versionados | OK | Apenas `data/.gitkeep` é rastreado; banco, sessão e mídia estão ignorados (`!!`). |

## Correções aplicadas nesta auditoria

- **CSV formula injection**: valores exportados iniciados por `=`, `+`, `-`, `@`,
  tabulação ou retorno de carro passam a receber um prefixo de aspa simples,
  evitando execução de fórmulas ao abrir o CSV em Excel/Google Sheets. Coberto
  por teste de regressão (`neutraliza CSV formula injection em nomes`).

## Itens conscientemente fora de escopo

- **Autenticação/autorização**: desnecessária para uma aplicação estritamente
  local e single-user, sem exposição de rede.
- **Reescrita do frontend**: o frontend já escapa a saída; não há necessidade de
  um framework ou sandbox adicional.

## Comandos de verificação

```bash
npm audit
npm audit --omit=dev
git ls-files            # nenhum segredo/banco/sessão versionado
git status --ignored --short
```
