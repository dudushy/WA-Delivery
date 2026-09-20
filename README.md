# WA-Delivery

Aplicação local para criar listas de contatos, preparar campanhas e enviar mensagens pelo WhatsApp com acompanhamento em tempo real.

> Utiliza Baileys, uma integração não oficial com o WhatsApp. Envie mensagens somente para contatos que autorizaram o recebimento.

## Requisitos

- Node.js 24.14.0 ou superior;
- npm, incluído na instalação do Node.js.

Baixe o Node.js em [nodejs.org](https://nodejs.org/).

## Windows

1. Baixe ou clone este repositório.
2. Abra a pasta do projeto.
3. Execute `RUN.bat`.

Na primeira execução, as dependências serão instaladas e a aplicação será compilada automaticamente. Depois disso, o navegador abrirá em:

```text
http://localhost:3000
```

Para encerrar, feche a janela do terminal ou pressione `Ctrl+C`.

## Linux e WSL

```bash
chmod +x run.sh
./run.sh
```

No WSL, abra `http://localhost:3000` no navegador do Windows caso ele não seja aberto automaticamente.

## Primeiro uso

1. Conecte o WhatsApp pelo QR Code.
2. Importe um CSV ou crie uma lista manual de contatos.
3. Crie e revise a campanha.
4. Confirme o envio.
5. Acompanhe o progresso pela página de monitoramento.

As configurações, contatos, campanhas, mídias e sessão ficam armazenados localmente no diretório `data/`.

## Atualização

Faça um backup pela página **Configurações** antes de atualizar. Depois execute:

```bash
git pull --ff-only
npm ci
npm run build
```

Inicie novamente com `RUN.bat` ou `./run.sh`.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Comandos de validação:

```bash
npm run check
npm run test:coverage
npm audit --omit=dev
```

## Backup

Na página **Configurações**, é possível baixar e restaurar um backup `.wabkp` contendo o banco, as mídias e a sessão local.

Guarde esse arquivo em local seguro, pois ele contém os dados da sessão do WhatsApp.
