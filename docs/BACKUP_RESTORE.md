# Backup, restauração e atualização segura

## O que o backup contém

Um único arquivo `.wabkp` com:

- `data/database/` — banco SQLite (contatos, listas, campanhas, tentativas, configurações);
- `data/media/` — imagens e vídeos das campanhas;
- `data/sessions/` — **sessão do WhatsApp (Baileys)**.

> A sessão do WhatsApp é **material sensível**: quem tiver o backup pode assumir a
> sessão conectada. Guarde o arquivo em local seguro e **nunca** o versione no Git
> nem o compartilhe.

O arquivo tem um cabeçalho com metadados (versão da aplicação, versão de schema,
data) e um checksum SHA-256 por arquivo, usados para validar integridade e
compatibilidade antes de restaurar.

## Criar um backup

1. Abra **Configurações**.
2. Em **Backup e restauração**, clique em **Baixar backup**.
3. O download `wa-delivery-backup-<data>.wabkp` é gerado. Antes de ler os
   arquivos, o banco é consolidado (checkpoint do WAL) para um snapshot consistente.

## Restaurar um backup

1. Abra **Configurações > Backup e restauração**.
2. Selecione o arquivo `.wabkp` e clique em **Restaurar backup**, confirmando.
3. A restauração:
   - valida assinatura, versão de schema e checksums;
   - cria uma **cópia de segurança** dos dados atuais antes de sobrescrever;
   - troca os dados de forma **atômica**, com rollback em caso de falha;
   - **reinicia a aplicação** (decisão de projeto: recarregar o banco com segurança).
4. Aguarde alguns segundos e abra `http://localhost:3000` novamente
   (ou rode `RUN.bat` / `./run.sh`).

### Regras de compatibilidade

- Um backup criado por uma versão **mais nova** (schema maior) é **recusado**:
  atualize a aplicação antes de restaurar.
- Arquivos que não sejam `.wabkp` válidos (assinatura/checksum incorretos) são
  recusados sem alterar os dados atuais.

## Atualização segura da aplicação

Recomendação: **faça um backup antes de atualizar.**

```bash
# faça backup pela interface primeiro
git pull --ff-only
npm ci
npm run build
```

O diretório `data/` é **preservado** na atualização (não é versionado nem tocado
pelo build). Depois, reinicie com `RUN.bat` / `./run.sh` ou `npm start`.

## Rollback

- Se uma atualização causar problema, restaure o backup gerado antes dela.
- A restauração já cria automaticamente uma cópia de segurança temporária dos
  dados atuais durante a troca; em caso de falha no meio do processo, os dados
  anteriores são recolocados (rollback).
