# Validação manual — WA-Delivery V2

Este roteiro cobre o que os testes automatizados **não** verificam: o envio real
por uma conta do WhatsApp via Baileys (integração não oficial). Os testes
automatizados usam um provider falso (`FakeWhatsAppProvider`) e nunca conectam
uma conta real.

> **Baileys é uma integração não oficial.** Use apenas com contatos que
> consentiram, respeite pedidos de opt-out e considere o risco de restrição da
> conta pelo WhatsApp. Nenhum recurso aqui promete evitar bloqueios.

## Antes de começar

- Prefira uma conta/número de teste sempre que possível.
- Crie uma lista contendo **apenas o seu próprio número**, para não incomodar
  terceiros durante a validação.
- Nunca compartilhe nem versione o diretório `data/sessions/` (contém material
  sensível da sessão do WhatsApp).
- O envio real **sempre** exige confirmação explícita na interface.

## 1. Preparar o ambiente

```bash
nvm install
nvm use
npm ci
npm run check
```

Resultado esperado: typecheck, testes automatizados e build concluídos sem
falhas. A quantidade exata de testes evolui a cada release; confira a saída do
comando em vez de um número fixo.

Depois inicie a aplicação:

```bash
npm run dev
# ou, para simular produção:
npm run build && npm start
```

Abra `http://localhost:3000`.

## 2. Conexão e restauração de sessão

- [ ] Clicar em **Conectar WhatsApp** exibe o QR Code.
- [ ] Escanear pelo celular (**WhatsApp > Dispositivos conectados > Conectar
      dispositivo**) leva ao estado **Conectado**.
- [ ] As credenciais aparecem apenas em `data/sessions/baileys/`.
- [ ] Encerrar com `Ctrl+C` e iniciar novamente reconecta **sem** pedir novo QR
      Code (sessão restaurada).

## 3. Configurações

- [ ] Em **Configurações**, ajustar país/DDD padrão, tentativas e intervalos
      salva sem erro e persiste após recarregar a página.

## 4. Contatos, inválidos e opt-out

- [ ] Criar uma lista manual com o próprio número.
- [ ] Importar um CSV pequeno: a prévia mostra válidos, inválidos e duplicados
      antes de salvar; as colunas extras ficam disponíveis como variáveis.
- [ ] Marcar um contato como **opt-out** e confirmar que ele é bloqueado na
      simulação da campanha (aparece na contagem de opt-outs ignorados).

## 5. Envio real de texto

- [ ] Criar campanha com mensagem de texto usando `{{nome}}`.
- [ ] Simular: conferir destinatários, opt-outs e duração estimada.
- [ ] Preparar e **confirmar** o envio real.
- [ ] Receber a mensagem no próprio número, com o nome substituído.

## 6. Envio real de imagem

- [ ] Criar campanha com uma imagem (JPG/PNG/WEBP) e legenda.
- [ ] Preparar, confirmar e receber a imagem com a legenda.

## 7. Envio real de vídeo

- [ ] Criar campanha com um vídeo MP4.
- [ ] Preparar, confirmar e receber o vídeo.

## 8. Pausa, retomada e cancelamento

Use uma lista um pouco maior (ainda apenas números seus, se possível) com
intervalo de alguns segundos para conseguir interagir.

- [ ] **Pausar** durante a execução interrompe os envios.
- [ ] **Retomar** continua de onde parou, sem reenviar quem já recebeu.
- [ ] **Cancelar** marca os pendentes como ignorados e encerra a campanha.

## 9. Desconexão e reconexão durante a campanha

- [ ] Durante uma campanha em execução, desconectar o dispositivo pelo celular
      pausa a campanha automaticamente (sem consumir tentativas indevidamente).
- [ ] Reconectar retoma a campanha automaticamente.

## 10. Reinício da aplicação no meio de uma campanha

- [ ] Encerrar a aplicação (`Ctrl+C`) com uma campanha em execução.
- [ ] Ao reiniciar, a campanha volta como **pausada** e nenhum destinatário é
      reenviado silenciosamente (recuperação idempotente).

## 11. Reenvio (follow-up) e relatórios

- [ ] A partir de uma campanha finalizada/cancelada/com falha, criar um
      **reenvio**: a nova campanha contém apenas os pendentes (falhas/ignorados),
      e a original é preservada como histórico.
- [ ] Exportar o **CSV completo** dos destinatários.
- [ ] Exportar o **CSV somente de falhas**.

## 12. Backup e restauração

- [ ] Gerar um backup pela interface e guardá-lo fora do repositório.
- [ ] (Opcional, com cautela) Restaurar o backup em um ambiente de teste e
      confirmar que os dados voltam. Consulte `docs/BACKUP_RESTORE.md`.

## Como remover a sessão local

Desconecte primeiro o dispositivo pelo WhatsApp. Depois, com o WA-Delivery
encerrado, remova apenas o diretório específico:

```text
data/sessions/baileys/
```

Na próxima execução, um novo QR Code será gerado.

## Registro dos resultados

Marque cada item acima ao validar. Se algum falhar, anote o passo, o
comportamento observado e o esperado, para que o problema possa ser
diagnosticado e corrigido com um teste de regressão quando aplicável.
