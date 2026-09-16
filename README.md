# WA-Delivery

Aplicação web local para preparar campanhas usando a **WhatsApp Business Platform / Cloud API oficial da Meta**. A versão 2 remove a automação do WhatsApp Web, Puppeteer, Chrome e autenticação por QR Code.

## Requisitos

- Node.js 24 (a versão está fixada em `.nvmrc`)
- Uma conta configurada na [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- Armazenamento de credenciais disponível no sistema:
  - Windows: Credential Manager
  - macOS: Keychain
  - Linux: Secret Service (por exemplo, GNOME Keyring)
  - WSL: arquivo local criptografado com AES-256-GCM e permissões restritas ao usuário

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

Para criar a aplicação na Meta, testar com o número fornecido pela plataforma, cadastrar um número real e gerar um token permanente, siga o **[guia completo de configuração da Meta Cloud API](docs/META_CLOUD_API.md)**.

Na tela **Configurar API**, informe:

- `Phone Number ID` (`META_PHONE_NUMBER_ID`)
- `WhatsApp Business Account ID` (`META_WABA_ID`)
- versão da Graph API (`META_API_VERSION`), atualmente `v26.0`
- access token (`META_ACCESS_TOKEN`)

O token é enviado somente ao backend local. Em Windows, macOS e Linux desktop, a aplicação prioriza o cofre nativo do sistema operacional. No WSL, onde normalmente não existe uma sessão Secret Service via D-Bus, é utilizado o backend de arquivo criptografado do `cross-keychain`. O token não é armazenado em `localStorage`, não aparece no arquivo de configuração comum e nunca é devolvido ao frontend. Os IDs e a versão da API ficam no diretório de configuração do usuário:

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
- O token nunca é salvo em texto puro: cofres nativos são priorizados e o fallback do WSL usa AES-256-GCM.
- No WSL, a chave e o arquivo criptografado ficam no mesmo ambiente Linux com permissões `0600`; isso protege contra leitura casual, mas é menos seguro que o Windows Credential Manager e não protege contra acesso `root`.
- Para trocar a porta, use `PORT`; para alterar o host conscientemente, use `HOST`.

## Validação

```bash
npm run check
```

Esse comando compila o TypeScript em modo estrito e executa os testes automatizados.
