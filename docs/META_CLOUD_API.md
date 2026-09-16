# Configurar a Meta WhatsApp Cloud API

Este guia mostra como preparar uma conta na Meta, testar a Cloud API, cadastrar um número real e preencher a tela **Configurar API** do WA-Delivery.

> A interface da Meta muda com frequência e alguns nomes podem aparecer em inglês. Procure pelos equivalentes indicados entre parênteses.

## O que será necessário

- uma conta pessoal do Facebook com autenticação em dois fatores ativada;
- acesso administrativo a um portfólio empresarial da Meta (*Business Portfolio*);
- uma empresa ou atividade comercial compatível com as políticas do WhatsApp;
- para produção, um número capaz de receber SMS ou ligação de voz;
- um cartão ou outro método de pagamento aceito pela Meta, quando a cobrança estiver habilitada;
- o WA-Delivery instalado e aberto em `http://127.0.0.1:3000`.

Ao final, você terá estes valores:

| Campo no WA-Delivery | Valor fornecido pela Meta |
|---|---|
| `Phone Number ID` | ID técnico do número de telefone; não é o número com DDD |
| `WhatsApp Business Account ID` | ID da conta do WhatsApp Business, também chamado de `WABA ID` |
| `Versão da Graph API` | versão suportada pelo aplicativo, por exemplo `v26.0` |
| `Access token` | credencial secreta com permissão para usar a API |

## Etapa 1 — Criar ou selecionar um portfólio empresarial

1. Acesse [Meta Business Suite](https://business.facebook.com/) e entre com sua conta.
2. Se já possuir um portfólio empresarial para a empresa, selecione-o.
3. Caso contrário, crie um portfólio e informe o nome da empresa, seu nome e um e-mail comercial válido.
4. Abra **Configurações do negócio** (*Business Settings*) e confira se sua conta possui acesso de administrador.
5. Quando a Meta solicitar, conclua a verificação do e-mail, a autenticação em dois fatores e a verificação da empresa.

A verificação empresarial pode não ser exigida para o primeiro teste, mas pode ser necessária para liberar recursos, aumentar limites e usar a integração em produção. Os dados informados devem corresponder aos documentos da empresa.

## Etapa 2 — Criar o aplicativo na Meta for Developers

1. Acesse [Meus aplicativos — Meta for Developers](https://developers.facebook.com/apps/).
2. Clique em **Criar aplicativo** (*Create App*).
3. Quando a Meta perguntar o caso de uso, selecione uma opção relacionada a **WhatsApp** ou **Outros** (*Other*) e depois **Business**. O assistente pode variar conforme a conta.
4. Informe um nome, por exemplo `WA-Delivery`, e um e-mail de contato.
5. Associe o aplicativo ao portfólio empresarial criado na etapa anterior.
6. Conclua a criação do aplicativo.
7. No painel do aplicativo, localize **WhatsApp** e clique em **Configurar** (*Set up*).
8. Se solicitado, crie ou selecione uma **WhatsApp Business Account (WABA)**.

Não compartilhe o `App Secret`. O WA-Delivery atual não precisa desse valor para enviar mensagens.

## Etapa 3 — Fazer o primeiro teste com os recursos da Meta

Na página **WhatsApp > Configuração da API** (*API Setup*), a Meta normalmente cria:

- um número de telefone de teste;
- uma WABA de teste;
- um `Phone Number ID`;
- um `WhatsApp Business Account ID`;
- um access token temporário.

Para testar:

1. Na seção de destinatários, clique em **Adicionar número de telefone** (*Add phone number*).
2. Informe um celular que você controla e confirme o código recebido. Esse é somente o destinatário autorizado do teste, não o número remetente definitivo.
3. Use o modelo `hello_world` oferecido pela Meta para enviar a primeira mensagem.
4. Confirme que a mensagem chegou ao destinatário.

O token desta página é temporário e expira rapidamente. Ele serve para validar a configuração inicial, não para manter o WA-Delivery funcionando em produção.

### Testar no WA-Delivery

1. Inicie a aplicação e abra `http://127.0.0.1:3000`.
2. Em **Configurar API**, copie da página **API Setup**:
   - `Phone Number ID`;
   - `WhatsApp Business Account ID`;
   - access token temporário.
3. Mantenha a versão da Graph API sugerida pela aplicação, salvo se a Meta indicar uma versão compatível diferente.
4. Clique em **Salvar configuração**.
5. Clique em **Testar conexão**.

Se o teste funcionar, a aplicação, os IDs e o token estão coerentes. Antes do uso real, continue as etapas abaixo.

## Etapa 4 — Cadastrar um número real

### 4.1 Escolher o número

Use preferencialmente um número exclusivo para a integração. Ele precisa:

- estar sob seu controle;
- receber SMS ou ligação internacional de confirmação;
- ser informado com código do país e DDD, por exemplo `+55 16 ...`;
- não estar conectado a outra WhatsApp Business Platform.

Se o número já estiver ativo no WhatsApp Messenger ou WhatsApp Business, não prossiga supondo que ele continuará funcionando normalmente no aplicativo. Dependendo do fluxo disponível para sua conta, pode ser necessário migrar/remover o número do app ou usar o onboarding oficial de **Coexistence**. Faça backup das conversas e confira a opção oferecida pela Meta antes de alterar um número em uso.

### 4.2 Adicionar e verificar

1. No aplicativo da Meta, abra **WhatsApp > Configuração da API** (*API Setup*).
2. Clique em **Adicionar número de telefone** (*Add phone number*).
3. Preencha o nome de exibição da empresa, fuso horário, categoria e descrição solicitados.
4. Informe o número com país e DDD.
5. Escolha receber o código por **SMS** ou **ligação de voz**.
6. Digite o código recebido.
7. Quando solicitado, defina ou informe o PIN de seis dígitos da verificação em duas etapas. Guarde esse PIN em local seguro.
8. Aguarde o número aparecer como conectado no **WhatsApp Manager**.

O nome de exibição passa por análise da Meta. Use um nome que represente claramente a empresa e seja compatível com a marca apresentada em seu site e documentos.

### 4.3 Localizar os IDs do número real

1. Volte para **WhatsApp > Configuração da API**.
2. No seletor **De** (*From*), selecione o número real.
3. Copie o `Phone Number ID` mostrado abaixo do número.
4. Copie também o `WhatsApp Business Account ID`.

Não use o telefone visível como `Phone Number ID`; são valores diferentes.

## Etapa 5 — Criar um token permanente de System User

Para evitar depender do token temporário:

1. Abra [Configurações do negócio](https://business.facebook.com/settings/).
2. Selecione o portfólio empresarial correto.
3. Acesse **Usuários > Usuários do sistema** (*Users > System Users*).
4. Clique em **Adicionar** e crie um usuário do sistema, por exemplo `WA-Delivery`.
5. Use uma função administrativa apenas se ela for necessária para administrar os ativos. Aplique o menor privilégio possível.
6. Com o usuário selecionado, clique em **Adicionar ativos** (*Add Assets*).
7. Atribua a ele:
   - o aplicativo `WA-Delivery`;
   - a WhatsApp Business Account usada pelo número;
   - permissão suficiente para gerenciar e enviar mensagens.
8. Clique em **Gerar novo token** (*Generate New Token*).
9. Selecione o aplicativo criado anteriormente.
10. Escolha a maior validade apropriada oferecida pela Meta.
11. Marque as permissões:
    - `whatsapp_business_messaging`;
    - `whatsapp_business_management`.
12. Gere e copie o token imediatamente. A Meta pode não exibi-lo novamente.

O token concede acesso à conta e deve ser tratado como uma senha. Não envie por mensagem, não publique no GitHub, não coloque em screenshots e não salve em arquivos versionados.

## Etapa 6 — Salvar os dados no WA-Delivery

1. Abra `http://127.0.0.1:3000`.
2. Acesse **Configurar API**.
3. Preencha:
   - **Phone Number ID:** ID do número real selecionado;
   - **WhatsApp Business Account ID:** WABA que contém esse número;
   - **Versão da Graph API:** versão exibida/suportada, mantendo o prefixo `v`;
   - **Access token:** token do System User.
4. Clique em **Salvar configuração**.
5. Clique em **Testar conexão**.

O access token é enviado somente ao backend local e guardado no cofre de credenciais do sistema operacional. Os demais IDs ficam na configuração local do usuário. O frontend não recebe o token de volta depois de salvá-lo.

## Etapa 7 — Configurar cobrança e templates

Para campanhas iniciadas pela empresa, a Meta normalmente exige templates aprovados.

1. No **WhatsApp Manager**, abra **Modelos de mensagem** (*Message Templates*).
2. Crie o template na categoria correta: `Marketing`, `Utility` ou `Authentication`.
3. Informe idioma, corpo e variáveis e envie para aprovação.
4. Aguarde o status **Approved** antes de usá-lo.
5. Em **Cobrança e pagamentos** (*Billing & Payments*), cadastre um método de pagamento quando exigido.
6. Antes de disparar, use o estimador do WA-Delivery e confira a categoria, o país dos destinatários e a tabela vigente.

A estimativa do WA-Delivery não substitui a cobrança da Meta. A fatura considera mensagens efetivamente entregues, categoria, mercado, volume e regras vigentes.

## Como validar a configuração

Considere o onboarding concluído quando:

- o número aparece como conectado no WhatsApp Manager;
- o botão **Testar conexão** do WA-Delivery retorna sucesso;
- o `Phone Number ID` testado corresponde ao número real;
- o token do System User possui acesso à WABA correta;
- há um template aprovado para a categoria de campanha pretendida;
- o método de pagamento está válido, quando exigido;
- os destinatários deram consentimento para receber mensagens.

## Problemas comuns

| Sintoma | Verificação recomendada |
|---|---|
| `401` ou token inválido | Gere outro token e confirme as duas permissões necessárias |
| `403` ou sem permissão | Atribua o aplicativo e a WABA ao System User |
| Número não encontrado | Confirme se o `Phone Number ID`, e não o telefone, foi informado |
| WABA incorreta | Confira se o WABA ID contém o número selecionado |
| Código SMS não chega | Verifique país/DDD, bloqueios da operadora e tente ligação de voz |
| Número já está em uso | Avalie migração ou Coexistence antes de remover a conta atual |
| Template rejeitado | Revise categoria, conteúdo, variáveis e políticas da Meta |
| Teste funcionava e parou | O token temporário provavelmente expirou; use um token de System User |

## Fontes oficiais

- [Primeiros passos com a WhatsApp Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Registrar um número comercial](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration)
- [Verificação em duas etapas](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/two-step-verification/)
- [Tokens de acesso para a WhatsApp Business Platform](https://developers.facebook.com/blog/post/2022/12/05/auth-tokens/)
- [Onboarding de números existentes no WhatsApp Business App](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Documentação oficial da Cloud API no Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)

