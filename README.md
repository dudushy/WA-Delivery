# [WA-Delivery](https://github.com/dudushy/WA-Delivery/)

Aplicação local para gerenciar campanhas de mensagens no WhatsApp a partir de uma
lista de contatos, com interface web em `localhost`.

---

## WA-Delivery V2

A V2 é uma aplicação local em Node.js + TypeScript com interface web em `localhost`,
Baileys (integração não oficial), SQLite e sem Chrome/Puppeteer. As configurações
são feitas pela interface web (não há mais `config.json`).

### Como rodar a V2

```bash
npm ci
npm run dev     # ambiente de desenvolvimento (http://localhost:3000)
# ou
npm run build && npm start
```

No Windows, use `INSTALL.bat` e `RUN.bat`. No Linux/WSL, use `./install.sh` e
`./run.sh`. Depois abra `http://localhost:3000`, conecte o WhatsApp pelo QR Code,
importe ou cadastre contatos, monte a campanha, revise a prévia e confirme o envio.

### Comportamentos principais da V2

- **Conexão**: ao abrir a aplicação, ela reconecta automaticamente se já houver uma
  sessão salva; caso contrário, exibe o QR Code. A sessão fica apenas neste computador.
- **Configurações**: país/DDD padrão, timeout, tentativas, backoff, retenção e som,
  todos pela interface (página Configurações), sem editar JSON.
- **Contatos**: página com abas "Importar CSV" e "Adicionar manualmente"; colunas
  extras do CSV viram variáveis de template; opt-out por contato.
- **Campanhas**: monte, simule e prepare. Uma campanha só é editável enquanto é
  rascunho (`draft`); após preparada, iniciada ou pausada, não é mais editável.
- **Prévia**: a prévia por destinatário preserva as quebras de linha da mensagem.
- **Envio real**: sempre exige confirmação explícita na interface. O checkbox de
  confirmação some quando a campanha inicia, e o estado "Campanha em execução" é exibido.
- **Exclusão**: permitida em qualquer estado, exceto enquanto a campanha está em execução.
- **Reenvio (follow-up)**: a partir de uma campanha finalizada, cancelada ou com falha,
  é possível criar uma nova campanha contendo apenas os destinatários pendentes
  (falhas e ignorados). A campanha original é mantida como histórico e a nova fica
  vinculada a ela.
- **Fila resiliente**: worker sequencial persistente, com timeout e classificação de
  erros (transitórios/permanentes), retry com limite e backoff exponencial para
  falhas transitórias, detecção de desconexão com retomada automática ao reconectar,
  e recuperação idempotente após reinício (sem reenvio silencioso).
- **Monitoramento e relatórios**: acompanhamento em tempo real do progresso, detalhe
  por destinatário (status, tentativas, último erro, data de envio), filtro por status
  e exportação CSV completa ou somente das falhas.
- **Backup/restauração**: backup em arquivo único pela interface (Configurações),
  com restauração validada e atômica.

O progresso detalhado e as fases estão em
[`docs/PROGRESS_V2.md`](docs/PROGRESS_V2.md) e
[`docs/IMPLEMENTATION_PLAN_V2.md`](docs/IMPLEMENTATION_PLAN_V2.md).

> Baileys é uma integração não oficial. Use apenas com contatos que consentiram, respeite
> pedidos de opt-out e considere o risco de restrição da conta pelo WhatsApp. Nenhum
> recurso promete evitar bloqueios.
