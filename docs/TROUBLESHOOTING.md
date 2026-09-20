# Solução de problemas — WA-Delivery V2

## Node.js não encontrado ou muito antigo

`RUN.bat` (ou `run.sh`) mostra uma mensagem com o
link para instalar o Node.js LTS. Instale a versão do `.nvmrc` (24.14.0+) e rode
novamente.

## Porta 3000 já em uso

O `RUN`/`run.sh` avisa quando a porta 3000 está ocupada e não abre uma segunda
instância. Feche o programa que usa a porta (ou a instância já aberta do
WA-Delivery) e tente novamente. Se a aplicação já estiver rodando, apenas abra
`http://localhost:3000`.

## O navegador não abriu automaticamente

Abra manualmente `http://localhost:3000`. No WSL, configure o `xdg-open` para o
navegador do Windows ou apenas acesse a URL no navegador do Windows.

## QR Code não aparece / conexão não completa

- Verifique se o WhatsApp do celular está atualizado.
- Em **Dispositivos conectados > Conectar dispositivo**, escaneie o QR exibido.
- Se expirar, clique em **Conectar WhatsApp** novamente para gerar um novo.

## Sessão desconectou no meio de uma campanha

A campanha é **pausada automaticamente** quando a conexão cai (sem consumir
tentativas indevidamente) e **retomada automaticamente** ao reconectar. Pausas
manuais não são retomadas sozinhas.

## Reiniciei a aplicação com uma campanha em andamento

A recuperação é **idempotente**: itens que ficaram "enviando" viram falha
(interrompido) e a campanha volta para **pausada**. Nada é reenviado
silenciosamente. Retome a campanha quando quiser.

## Falha ao importar CSV

- Confirme a extensão `.csv`.
- A prévia detecta o delimitador e o encoding; selecione a coluna de telefone
  correta. Linhas inválidas/duplicadas aparecem na análise e não são salvas.
- Limite de 20.000 linhas por importação.

## Falha ao enviar mídia

- Formatos aceitos: JPG, PNG, WEBP (até 10 MB) e MP4 (até 64 MB).
- O conteúdo é validado por assinatura (magic bytes); renomear a extensão não
  contorna a checagem.

## Backup não é aceito na restauração

- O arquivo precisa ser um `.wabkp` válido (assinatura e checksums corretos).
- Backups de versões mais novas (schema maior) são recusados: atualize a
  aplicação antes de restaurar. Veja `docs/BACKUP_RESTORE.md`.

## Onde ficam os logs e dados

- Dados locais: `data/database`, `data/media`, `data/sessions` (todos ignorados
  pelo Git).
- Logs são estruturados e **mascaram telefones**; nunca registram conteúdo de
  mensagens nem credenciais. Ajuste o nível com a variável `LOG_LEVEL`
  (ex.: `LOG_LEVEL=debug`).

## Erros inesperados na interface

A interface mostra mensagens amigáveis; detalhes técnicos ficam apenas nos logs
(sem stack trace para o usuário). Consulte o terminal onde a aplicação roda.
