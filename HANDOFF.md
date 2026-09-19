# HANDOFF — WA-Delivery V2

Documento de transferência de contexto. Não contém credenciais, sessão,
telefones reais nem mensagens reais.

## Estado atual

- **Branch**: `feat/v2-baileys-local-web-app`
- **HEAD**: `0ed6848` (docs/release: 2.0.0-rc.1)
- **Versão**: `2.0.0-rc.1`
- **Working tree**: limpo
- **Checkpoint atual**: todos os checkpoints automatizáveis (A–H) concluídos.
  Pendente apenas a **validação manual do usuário** e a **abertura do PR** (o push
  e o PR são feitos pelo usuário — regra de Git do projeto).

## Verificações executadas (nesta máquina)

- `npm ci`: OK (lockfile coerente com a versão).
- `npm run check` (typecheck + lint + format:check + testes + build): **verde**.
- Testes: **127** aprovados, 0 falhas.
- `npm run test:coverage`: acima dos limiares (linhas ~91%, funções ~87%, branches ~76%).
- `npm audit` e `npm audit --omit=dev`: **0 vulnerabilidades**.
- `git diff --check`: limpo.
- Nenhum dado sensível versionado (`git ls-files` em `data/` mostra apenas `.gitkeep`).
- Smoke tests locais: launcher (`scripts/start.mjs`) sobe e responde ao health
  check; `GET /api/backup` retorna arquivo `WABKP01`; restauração de arquivo
  inválido retorna 422.

## Migrations

- Schema mais recente: **v9**.
- v8: tabela `settings` (configurações operacionais).
- v9: `contacts.opted_out` (opt-out global por telefone).
- Testes de upgrade sobre banco populado: v5, v6, v7, v9.

## Commits desta sessão (do mais antigo ao mais novo)

1. `507560f` feat(settings): configurações persistentes via UI
2. `0a258e1` feat(contacts): opt-out persistente e bloqueio em campanhas
3. `46cf8b2` feat(contacts): colunas de CSV como variáveis de template
4. `d2ccc3c` feat(observability): logs estruturados com masking + retenção
5. `d66878d` docs(validation): checklist manual + PROGRESS pós-Checkpoint A
6. `1050b98` feat(setup): scripts robustos Windows/Linux
7. `20c6db3` feat(backup): backup/restauração de data/ com restauração segura
8. `b009d68` feat(onboarding): guia de primeiro uso + mensagens de erro seguras
9. `d63ae9f` chore(v1): remoção do legado V1
10. `5771afe` build(quality): ESLint flat + Prettier + scripts de qualidade
11. `be2b429` style: formatação Prettier (commit isolado)
12. `812458e` fix(security): CSV formula injection + resumo de auditoria
13. `0ed6848` docs(release): documentação completa + versão 2.0.0-rc.1

## Pendências (dependem do usuário)

- **Validação manual**: `docs/PHASE_0_MANUAL_VALIDATION.md` e
  `docs/RELEASE_CHECKLIST.md` (Windows nativo, WSL e WhatsApp real usando uma
  lista apenas com o próprio número).
- **Push e PR**: não executados por regra de Git. Ver "Próximo comando exato".

## Próximo comando exato

O usuário deve revisar e, quando quiser, publicar a branch e abrir o PR (sem merge):

```bash
git push -u origin feat/v2-baileys-local-web-app
gh pr create --base main --head feat/v2-baileys-local-web-app \
  --title "WA-Delivery V2 (2.0.0-rc.1): app local, Baileys, sem V1" \
  --body-file docs/PR_DESCRIPTION.md
```

Não fazer merge do PR automaticamente. Não criar tag nem GitHub Release nesta etapa.
