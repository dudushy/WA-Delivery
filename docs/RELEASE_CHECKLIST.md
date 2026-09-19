# Checklist de release — WA-Delivery V2

## Automatizável (verificado nesta branch)

- [x] `npm ci` sem erros.
- [x] `npm run check` (typecheck + lint + format:check + testes + build) verde.
- [x] `npm run test:coverage` acima dos limiares (linhas ≥ 70%, funções ≥ 70%,
      branches ≥ 60%).
- [x] `npm audit` e `npm audit --omit=dev` sem vulnerabilidades.
- [x] `git diff --check` limpo.
- [x] Nenhum dado sensível versionado (`git ls-files` mostra apenas `data/.gitkeep`
      em `data/`; banco, sessão e mídia ignorados).
- [x] Migrations incrementais com testes de upgrade sobre banco populado
      (v5, v6, v7, v9).
- [x] Documentação atualizada (README, INSTALLATION, BACKUP_RESTORE,
      TROUBLESHOOTING, SECURITY_AUDIT, CHANGELOG, PROGRESS_V2).
- [x] Versão do projeto em `2.0.0-rc.1`.

## Validação manual (pendente do usuário)

Roteiro completo em `docs/PHASE_0_MANUAL_VALIDATION.md`. Usar uma lista com
**apenas o próprio número**.

### Windows nativo

- [ ] Caminho simples, com espaços e com acentos.
- [ ] `INSTALL.bat` (duplo clique e terminal).
- [ ] `RUN.bat` abre o navegador; porta ocupada é tratada.
- [ ] Instalação limpa e atualização preservando `data/`.
- [ ] Backup e restauração.

### WSL + navegador no Windows

- [ ] `npm ci`, build, execução, acesso em `localhost`.
- [ ] Sessão persistente; encerramento com `Ctrl+C`.

### WhatsApp real (lista só com o próprio número)

- [ ] Texto, imagem e vídeo.
- [ ] Pausa, retomada e cancelamento.
- [ ] Desconexão, reconexão e reinício.
- [ ] Follow-up, relatório e CSV de falhas.

## Ao concluir a validação manual

1. Atualizar `docs/PROGRESS_V2.md` e este checklist.
2. `npm ci && npm run check && npm audit && npm audit --omit=dev`.
3. Confirmar working tree limpo e nada sensível versionado.
4. Commit final de release candidate e push da branch.
5. Abrir o PR de `feat/v2-baileys-local-web-app` para `main` (sem merge).

## Rollback

- Manter o backup gerado antes de qualquer atualização.
- Para reverter código: `git checkout <sha-anterior>` na branch, ou reverter o PR.
- Para reverter dados: restaurar o backup pela interface (ver `docs/BACKUP_RESTORE.md`).

## Não fazer nesta etapa

- Não criar tag nem GitHub Release.
- Não fazer merge do PR automaticamente.
