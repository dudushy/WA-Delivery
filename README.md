# [WA-Delivery](https://github.com/dudushy/WA-Delivery/)

Bot para WhatsApp que envia uma mensagem para uma lista de contatos usando um arquivo `.csv`.

---

## Requisitos

- [Node.js](https://nodejs.org/)

## Instalacao

```bash
npm ci
```

## Como configurar

O bot usa o arquivo `config.json` para saber:

- onde esta o executavel do Google Chrome, quando necessario
- onde esta o arquivo `.txt` com a mensagem
- onde esta o arquivo `.csv` com os contatos
- onde esta a midia opcional para envio, como `.mp4` ou `.png`
- qual o intervalo entre as mensagens, em segundos
- qual coluna do `.csv` contem o numero de telefone

### Estrutura esperada na pasta `data`

Exemplo:

```text
data/
	contacts.csv
	message.txt
	video.mp4
```

Voce pode usar outros nomes de arquivo, desde que atualize os caminhos no `config.json`.

### Exemplo de `config.json`

```json
{
	"chrome-executable-path": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"message-file": "data/message.txt",
	"contacts-file": "data/contacts.csv",
	"media-file": "data/video.mp4",
	"delay-between-messages": 0.5,
	"csv-phone-key": "phone"
}
```

### O que cada campo faz

- `chrome-executable-path`: caminho completo do executavel do Google Chrome
- `message-file`: caminho do arquivo `.txt` com a mensagem que sera enviada
- `contacts-file`: caminho do arquivo `.csv` com os contatos
- `media-file`: caminho da midia opcional que sera enviada junto com a mensagem
- `delay-between-messages`: tempo de espera entre um envio e outro, em segundos
- `csv-phone-key`: nome exato da coluna do `.csv` que contem o telefone

### Configuracao do Chrome

O projeto pode usar o caminho do Chrome definido no `config.json` pela chave `chrome-executable-path`.

Exemplo no Windows:

```json
"chrome-executable-path": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
```

Se o Chrome ja estiver disponivel automaticamente no ambiente, voce pode deixar esse campo vazio:

```json
"chrome-executable-path": ""
```

Use esse campo principalmente quando o bot nao conseguir encontrar o navegador sozinho.

## Como preparar os arquivos

### 1. Arquivo de mensagem

Crie um arquivo `.txt` dentro da pasta `data`, por exemplo:

`data/message.txt`

Conteudo de exemplo:

```text
Ola! Esta e uma mensagem de teste.
```

### 2. Arquivo de contatos

Crie ou exporte um arquivo `.csv` com uma coluna que contenha o numero de telefone.

Exemplo:

```csv
name,phone
Maria,5511999999999
Joao,5511888888888
```

Nesse caso, o valor de `csv-phone-key` deve ser:

```json
"csv-phone-key": "phone"
```

Se o seu `.csv` usar outro nome de coluna, como `MobilePhone`, `Telefone` ou `Numero`, basta informar esse mesmo nome no `config.json`.

### 3. Arquivo de midia opcional

Se quiser enviar uma imagem ou video junto com a mensagem, informe o caminho em `media-file`.

Exemplos:

- `data/imagem.png`
- `data/video.mp4`

Se nao quiser enviar midia, remova a chave `media-file` do `config.json` ou deixe sem valor.

## Como executar

1. Ajuste os arquivos dentro da pasta `data`
2. Confira o `config.json`
3. Execute o projeto:

```bash
npm start
```

4. Escaneie o QR code com o WhatsApp no celular
5. Aguarde o bot terminar a autenticacao
6. Pressione `ENTER` para iniciar os envios

## Observacoes

- O bot limpa o numero e usa apenas os digitos encontrados no campo configurado no `.csv`
- Ao final do processo, arquivos de log sao gerados na pasta `logs`
- Se o contato nao existir no WhatsApp, ele sera listado como falha
