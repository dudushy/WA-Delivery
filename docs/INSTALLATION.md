# Instalação — WA-Delivery V2

Aplicação local em Node.js + TypeScript, com interface web em `http://localhost:3000`.
Não usa Docker, Chrome/Puppeteer nem serviços externos.

## Requisitos

- **Node.js 24.14.0 ou superior** (LTS compatível). A versão fixada está em `.nvmrc`.
- **npm** (acompanha o Node.js).
- Sistema: Windows 10/11, Linux ou WSL.

## Windows (usuário não técnico)

1. Instale o Node.js LTS: https://nodejs.org/
2. Baixe/clone o projeto em uma pasta (o caminho pode conter espaços/acentos).
3. Dê **duplo clique em `RUN.bat`**. Na primeira vez ele instala as dependências
   e compila automaticamente; nas próximas, apenas inicia. O navegador abre em
   `http://localhost:3000`.

Se o Node.js não estiver instalado ou for muito antigo, o script mostra uma
mensagem clara com o link para instalar a versão correta.

## Windows (terminal)

```bat
RUN.bat
```

## Linux / WSL

```bash
nvm use            # opcional, se usa nvm; garante a versão do .nvmrc
./run.sh           # instala/compila na primeira vez, inicia e tenta abrir o navegador
```

No WSL, o `xdg-open` pode abrir o navegador do Windows se estiver configurado;
caso contrário, acesse `http://localhost:3000` manualmente no navegador do Windows.

## Desenvolvimento (terminal, qualquer SO)

```bash
npm ci
npm run dev              # http://localhost:3000 (tsx, sem build)
# ou
npm run build && npm start
```

## Verificação de qualidade

```bash
npm run check            # typecheck + lint + format:check + testes + build
npm run test:coverage    # testes com cobertura e limiares mínimos
npm audit --omit=dev     # dependências de produção
```

## Portas e binding

A aplicação escuta apenas em `127.0.0.1:3000` (somente a própria máquina). Se a
porta 3000 estiver ocupada, o `RUN`/`run.sh` avisa e não abre múltiplas instâncias.
