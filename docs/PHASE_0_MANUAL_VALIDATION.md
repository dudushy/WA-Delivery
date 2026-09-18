# Validação manual — Fase 0

Esta validação cobre o único ponto que os testes automatizados não conseguem confirmar: conexão com uma conta real do WhatsApp e envio real pelo protocolo atual.

## Antes de começar

- use uma conta/número de teste sempre que possível;
- não execute campanhas durante esta validação;
- não compartilhe nem versione o diretório `data/sessions/`;
- o programa desta etapa não dispara mensagens automaticamente.

## 1. Preparar o ambiente

No diretório do projeto:

```bash
nvm install
nvm use
npm ci
npm run check
```

Resultado esperado: typecheck, 8 testes unitários e build concluídos sem falhas.

## 2. Conectar o WhatsApp

```bash
npm run dev
```

No celular, abra **WhatsApp > Dispositivos conectados > Conectar dispositivo** e escaneie o QR Code exibido no terminal.

Resultado esperado:

```text
WhatsApp conectado. A sessão foi salva localmente.
```

As credenciais devem aparecer apenas em `data/sessions/baileys/`, diretório ignorado pelo Git.

## 3. Validar persistência da sessão

1. encerre com `Ctrl+C`;
2. execute novamente `npm run dev`;
3. confirme que conecta sem solicitar outro QR Code.

## 4. Envio real

O adapter já oferece `isRegisteredNumber`, `sendText` e `sendMedia`, mas esta etapa ainda não expõe comandos de envio para evitar disparos acidentais. O teste real dessas operações será disponibilizado pela interface, com destinatário e conteúdo explícitos e uma confirmação antes do envio.

## Como remover a sessão local

Desconecte primeiro o dispositivo pelo WhatsApp. Depois, com o WA-Delivery encerrado, remova somente o diretório específico:

```text
data/sessions/baileys/
```

Na próxima execução, um novo QR Code será gerado.
