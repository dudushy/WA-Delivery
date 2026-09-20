# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue, de forma simplificada, o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o versionamento
segue [SemVer](https://semver.org/lang/pt-BR/).

## [2.0.0-rc.1] - 2026-09-19

Release candidate da V2: aplicação local (Node.js + TypeScript + Baileys + SQLite),
com interface web em `localhost`, sem Chrome/Puppeteer e sem `config.json`.

### Adicionado

- Configurações operacionais persistentes pela interface (país/DDD, timeout,
  tentativas, backoff, retenção, som), com defaults seguros e validação
  (migration `settings`, v8).
- Opt-out por contato (global por telefone), bloqueado no snapshot, na simulação
  e no reenvio (migration v9).
- Preservação das colunas extras do CSV como variáveis de template `{{slug}}`,
  além de `{{nome}}`, validadas contra as colunas da lista.
- Logs estruturados (pino) com mascaramento de telefones e credenciais.
- Política de retenção configurável e limpeza explícita de campanhas antigas.
- Backup e restauração do diretório `data/` em arquivo único `.wabkp`, com
  validação de versão, checksums, proteção contra path traversal, restauração
  atômica com rollback e reinício após restaurar.
- Guia de primeiro uso (onboarding) na interface, com avisos sobre o Baileys
  não oficial e consentimento/opt-out.
- Scripts de execução robustos para Windows (`RUN.bat`) e Linux/WSL (`run.sh`),
  que instalam as dependências e compilam automaticamente na primeira execução,
  com verificação de versão do Node, espera do health check e abertura do
  navegador.
- Ferramentas de qualidade: ESLint (flat config, TS/ESM), Prettier e cobertura
  de testes com limiares mínimos. Scripts `lint`, `lint:fix`, `format`,
  `format:check`, `test:coverage` e `check`.
- Documentação: `INSTALLATION`, `BACKUP_RESTORE`, `TROUBLESHOOTING`,
  `RELEASE_CHECKLIST`, `SECURITY_AUDIT` e checklist de validação manual.

### Corrigido

- CSV formula injection na exportação: valores iniciados por `= + - @` (tab/CR)
  são neutralizados com prefixo de aspa simples.
- Mensagens de erro do backend não expõem stack trace ao usuário final; detalhes
  ficam apenas nos logs mascarados.
- Estimativa de tempo restante mais realista (considera pendentes e taxa de
  falhas observada).

### Removido

- Código, configuração e documentação da V1 (`src/index.js`, `src/utils/load*.js`,
  `config.json`) baseados em `whatsapp-web.js`/Puppeteer.

### Base já existente na V2 (fases anteriores)

- Conexão via QR com sessão persistente e reconexão automática; importação CSV
  com prévia; cadastro manual; composer de campanha com simulação; snapshot
  imutável; fila resiliente (timeout, classificação de erro, retry com backoff,
  tratamento de desconexão, recuperação idempotente); reenvio (follow-up);
  monitoramento em tempo real e exportação CSV.

[2.0.0-rc.1]: https://github.com/dudushy/WA-Delivery/tree/feat/v2-baileys-local-web-app
