# WA-Delivery

Aplicação web local para preparar campanhas usando a **WhatsApp Business Platform / Cloud API oficial da Meta**. A versão 2 remove a automação do WhatsApp Web, Puppeteer, Chrome e autenticação por QR Code.

## Requisitos

- Node.js 24 (a versão está fixada em `.nvmrc`)
- Uma conta configurada na [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- Um cofre de credenciais disponível no sistema:
  - Windows: Credential Manager
  - macOS: Keychain
  - Linux: Secret Service (por exemplo, GNOME Keyring)

## Instalação e execução

```bash
nvm install
nvm use
npm ci
npm run build
npm start
```

Abra `http://127.0.0.1:3000` no navegador. Em desenvolvimento, use `npm run dev`.

No Windows, também é possível executar `INSTALL.bat` uma vez e depois `RUN.bat`.

## Configuração da Meta pela interface

Na tela **Configurar API**, informe:

- `Phone Number ID` (`META_PHONE_NUMBER_ID`)
- `WhatsApp Business Account ID` (`META_WABA_ID`)
- versão da Graph API (`META_API_VERSION`), atualmente `v26.0`
- access token (`META_ACCESS_TOKEN`)

O token é enviado somente ao backend local e salvo no cofre nativo do sistema operacional. Ele não é armazenado em `localStorage`, não aparece no arquivo de configuração e nunca é devolvido ao frontend. Os IDs e a versão da API ficam no diretório de configuração do usuário:

- Windows: `%APPDATA%\WA-Delivery\config.json`
- macOS: `~/Library/Application Support/WA-Delivery/config.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/wa-delivery/config.json`

As configurações persistem após fechar a aplicação ou reiniciar o computador e são carregadas como variáveis do processo quando o WA-Delivery inicia. Variáveis já definidas no ambiente também são aceitas como bootstrap.

Use **Testar conexão** para validar o token e o `Phone Number ID` diretamente na Graph API.

## Estimativa de custos

A tela **Estimar custo** usa a tabela brasileira incorporada, vigente desde 01/07/2026:

| Categoria | Preço estimado por mensagem entregue |
|---|---:|
| Marketing | R$ 0,3217 |
| Utility | R$ 0,0350 |
| Authentication | R$ 0,0350 |

A estimativa não é uma cotação nem uma fatura. A Meta cobra mensagens entregues, e o valor pode variar por país do destinatário, categoria aprovada, volume e atualizações da tabela. Confira sempre a [tabela oficial da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

## Segurança

- O servidor escuta somente em `127.0.0.1` por padrão.
- O token nunca é registrado em logs nem devolvido ao browser.
- O backend força o cofre nativo e não permite fallback silencioso para arquivo em texto puro.
- Para trocar a porta, use `PORT`; para alterar o host conscientemente, use `HOST`.

## Validação

```bash
npm run check
```

Esse comando compila o TypeScript em modo estrito e executa os testes automatizados.
