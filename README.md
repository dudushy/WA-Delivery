# [WA-Delivery](https://github.com/dudushy/WA-Delivery/)

Aplicação **local** para gerenciar campanhas de mensagens no WhatsApp a partir de
uma lista de contatos, com interface web em `http://localhost:3000`. Roda em
Node.js + TypeScript, usa Baileys (integração não oficial) e SQLite, **sem**
Docker, Chrome/Puppeteer ou serviços externos. Toda a configuração é feita pela
interface (não há mais `config.json`).

> **Aviso — Baileys é uma integração não oficial.** Use apenas com contatos que
> consentiram em receber suas mensagens, respeite pedidos de opt-out e considere
> o risco de restrição/bloqueio da conta pelo WhatsApp. **Nenhum recurso deste
> projeto promete evitar bloqueios.** Você é responsável pelo uso.

## Sumário

- [Objetivo](#objetivo)
- [Screenshots](#screenshots)
- [Requisitos](#requisitos)
- [Instalação no Windows](#instalação-no-windows)
- [Instalação no Linux/WSL](#instalação-no-linuxwsl)
- [Execução e primeiro uso](#execução-e-primeiro-uso)
- [Atualização](#atualização)
- [Backup e restauração](#backup-e-restauração)
- [Solução de problemas](#solução-de-problemas)
- [Limitações](#limitações)
- [Consentimento e opt-out](#consentimento-e-opt-out)
- [Desenvolvimento](#desenvolvimento)
- [Testes](#testes)
- [Arquitetura resumida](#arquitetura-resumida)
- [Licença](#licença)

## Objetivo

Permitir que uma pessoa não técnica instale, conecte o WhatsApp, importe ou
cadastre contatos, monte uma campanha, revise a prévia e envie mensagens em massa
de forma controlada — tudo por uma interface web local, com histórico e
relatórios, sem depender de nuvem.

## Screenshots

As imagens não são versionadas. Para adicioná-las, coloque capturas em `docs/img/`
e referencie aqui, por exemplo:

```markdown
![Conexão](docs/img/conexao.png)
![Campanha](docs/img/campanha.png)
![Monitoramento](docs/img/monitoramento.png)
```

## Requisitos

- **Node.js 24.14.0+** (LTS compatível; versão fixada em `.nvmrc`).
- **npm** (acompanha o Node.js).
- Windows 10/11, Linux ou WSL.

## Instalação no Windows

Usuário não técnico:

1. Instale o Node.js LTS: https://nodejs.org/
2. Baixe/clone o projeto (o caminho pode ter espaços/acentos).
3. Duplo clique em **`INSTALL.bat`** e aguarde a conclusão.
4. Duplo clique em **`RUN.bat`** — o navegador abre em `http://localhost:3000`.

Por terminal: `INSTALL.bat` e depois `RUN.bat`.

## Instalação no Linux/WSL

```bash
nvm use          # opcional (respeita o .nvmrc)
./install.sh     # instala dependências e compila
./run.sh         # inicia e tenta abrir o navegador
```

No WSL, acesse `http://localhost:3000` no navegador do Windows caso o `xdg-open`
não esteja configurado.

Detalhes em [`docs/INSTALLATION.md`](docs/INSTALLATION.md).

## Execução e primeiro uso

Na primeira vez, um **guia de primeiro uso** aparece na interface (pode ser
reaberto pelo botão "Ver guia de primeiro uso"). O fluxo típico:

1. **Conecte o WhatsApp** lendo o QR Code (a sessão fica salva só neste computador
   e reconecta automaticamente nas próximas vezes).
2. **Configurações**: ajuste país/DDD padrão, timeout, tentativas, backoff,
   retenção e som.
3. **Contatos**: importe um CSV (com prévia de válidos/inválidos/duplicados) ou
   cadastre manualmente; marque **opt-out** de quem não deve receber; colunas
   extras do CSV viram variáveis `{{coluna}}`.
4. **Campanhas**: escreva a mensagem (`{{nome}}` e colunas extras), anexe imagem/
   vídeo opcional, defina o intervalo, **simule** e **prepare** (gera o snapshot).
5. **Confirme** explicitamente o envio real.
6. **Monitore** o progresso em tempo real e **exporte** o relatório (completo ou
   somente falhas).
7. **Backup** dos seus dados em Configurações.

## Atualização

Faça um backup antes de atualizar. Depois:

```bash
git pull --ff-only
npm ci
npm run build
```

O diretório `data/` é preservado. Veja [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md).

## Backup e restauração

Backup em arquivo único `.wabkp` (banco + mídias + sessão) pela página
**Configurações**. A restauração valida versão e checksums, cria uma cópia de
segurança antes de sobrescrever, é atômica com rollback e reinicia a aplicação.
A sessão do WhatsApp é sensível — guarde o backup com cuidado. Detalhes em
[`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md).

## Solução de problemas

Consulte [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) (Node ausente/antigo,
porta ocupada, QR, desconexão, importação, mídia, backup, logs).

## Limitações

- Integração **não oficial** (Baileys): pode quebrar ou levar a restrição da conta.
- **Local e single-user**: sem múltiplos usuários ou múltiplas contas.
- Sem agendamento recorrente, sem chatbot/respostas automáticas.
- Sem Meta WhatsApp Cloud API, Docker ou serviços em nuvem.

## Consentimento e opt-out

Envie somente para quem consentiu. Respeite pedidos de opt-out: marque o contato
como opt-out (Contatos) — ele é bloqueado na simulação, no snapshot e no reenvio.
Intervalos e jitter são controles operacionais e **não** garantem proteção contra
bloqueio.

## Desenvolvimento

```bash
npm ci
npm run dev            # http://localhost:3000 (tsx, sem build)
npm run build && npm start
npm run lint           # ESLint (flat config, TS/ESM)
npm run format         # Prettier
npm run check          # typecheck + lint + format:check + testes + build
```

## Testes

```bash
npm test               # suíte com o test runner do Node
npm run test:coverage  # com cobertura e limiares mínimos
```

Os testes usam um `FakeWhatsAppProvider` e **nunca** conectam uma conta real. A
validação de envio real é manual: veja
[`docs/PHASE_0_MANUAL_VALIDATION.md`](docs/PHASE_0_MANUAL_VALIDATION.md).

## Arquitetura resumida

```text
Browser (localhost) ──HTTP + SSE── Node.js + TypeScript
                                    ├─ Web UI (public/) + REST/SSE (src/web)
                                    ├─ Domínio (src/modules): contacts, campaigns,
                                    │   media, queue, settings, backup
                                    ├─ WhatsAppProvider ─ BaileysWhatsAppProvider
                                    └─ SQLite (node:sqlite) + arquivos locais (data/)
```

O domínio (contatos, campanhas, fila, relatórios) não depende diretamente do
Baileys — ele fica isolado atrás do `WhatsAppProvider`. Progresso e plano em
[`docs/PROGRESS_V2.md`](docs/PROGRESS_V2.md) e
[`docs/IMPLEMENTATION_PLAN_V2.md`](docs/IMPLEMENTATION_PLAN_V2.md).

## Licença

ISC (veja o campo `license` em `package.json`).
