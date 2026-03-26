const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Importa os utilitários
const { loadConfig } = require('./utils/loadConfig');
const { loadContacts } = require('./utils/loadContacts');
const { loadMessage } = require('./utils/loadMessage');
const { loadMedia } = require('./utils/loadMedia');

const CONFIG = loadConfig();

// Configuração do readline para capturar ENTER
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const puppeteerConfig = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ]
};

if (CONFIG['chrome-executable-path']) {
  puppeteerConfig.path = CONFIG['chrome-executable-path'];
}

const bot = new Client({
  authStrategy: new LocalAuth({
    clientId: 'wa-delivery',
  }),
  webVersionCache: {
    type: 'local',
  },
  puppeteer: puppeteerConfig,
});

let CONTACTS = [];
let MESSAGE = '';
let MEDIA = null;
let DELAY_BETWEEN_MESSAGES = 2; // Valor padrão
let CSV_PHONE_KEY = 'MobilePhone';
let isAuthenticated = false;
let isReady = false;
let isFullyLoaded = false;

// Arrays para controlar sucessos e falhas
let successfulContacts = [];
let failedContacts = [];

function sleep(seconds) {
  return new Promise(resolve => {
    console.log(`[sleep] Aguardando ${seconds}s...`);
    setTimeout(resolve, seconds * 1000);
  });
}

function generateLogFiles() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = 'logs';

    // Cria diretório de logs se não existir
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Gera log de sucessos
    if (successfulContacts.length > 0) {
      const successLogPath = path.join(logsDir, `successful_contacts_${timestamp}.txt`);
      const successContent = [
        '=== ENVIOS COM SUCESSO ===',
        `Data e hora: ${new Date().toISOString()}`,
        `Total com sucesso: ${successfulContacts.length}`,
        `Mensagem enviada: "${MESSAGE}"`,
        `Midia anexada: ${MEDIA ? 'Sim' : 'Nao'}`,
        '',
        'Numeros de telefone:',
        ...successfulContacts.map((contact, index) => `${index + 1}. ${contact}`)
      ].join('\n');

      fs.writeFileSync(successLogPath, successContent, 'utf8');
      console.log(`[LOG] Lista de contatos com sucesso salva em: ${successLogPath}`);
    }

    // Gera log de falhas
    if (failedContacts.length > 0) {
      const failedLogPath = path.join(logsDir, `failed_contacts_${timestamp}.txt`);
      const failedContent = [
        '=== ENVIOS COM FALHA ===',
        `Data e hora: ${new Date().toISOString()}`,
        `Total com falha: ${failedContacts.length}`,
        `Mensagem tentada: "${MESSAGE}"`,
        `Midia anexada: ${MEDIA ? 'Sim' : 'Nao'}`,
        '',
        'Contatos com falha (numero - motivo):',
        ...failedContacts.map((contact, index) => `${index + 1}. ${contact.phone} - ${contact.reason}`)
      ].join('\n');

      fs.writeFileSync(failedLogPath, failedContent, 'utf8');
      console.log(`[LOG] Lista de contatos com falha salva em: ${failedLogPath}`);
    }

    // Gera resumo geral
    const summaryLogPath = path.join(logsDir, `delivery_summary_${timestamp}.txt`);
    const summaryContent = [
      '=== RESUMO DOS ENVIOS ===',
      `Data e hora: ${new Date().toISOString()}`,
      `Total de contatos processados: ${CONTACTS.length}`,
      `Envios com sucesso: ${successfulContacts.length}`,
      `Envios com falha: ${failedContacts.length}`,
      `Taxa de sucesso: ${((successfulContacts.length / CONTACTS.length) * 100).toFixed(2)}%`,
      `Mensagem: "${MESSAGE}"`,
      `Midia anexada: ${MEDIA ? 'Sim (' + MEDIA.mimetype + ')' : 'Nao'}`,
      `Intervalo entre mensagens: ${DELAY_BETWEEN_MESSAGES}s`,
      '',
      '=== RESULTADOS DETALHADOS ===',
      '',
      'Com sucesso:',
      ...successfulContacts.map((contact, index) => `  ${index + 1}. ${contact}`),
      '',
      'Com falha:',
      ...failedContacts.map((contact, index) => `  ${index + 1}. ${contact.phone} - ${contact.reason}`)
    ].join('\n');

    fs.writeFileSync(summaryLogPath, summaryContent, 'utf8');
    console.log(`[LOG] Resumo dos envios salvo em: ${summaryLogPath}`);

  } catch (error) {
    console.error('[LOG] Erro ao gerar arquivos de log:', error);
  }
}

async function sendMessages() {
  if (CONTACTS.length === 0) {
    console.log('[sendMessages] Nao ha contatos para enviar mensagem');
    return;
  }

  console.log(`[sendMessages] Iniciando envio para ${CONTACTS.length} contatos...`);
  console.log(`[sendMessages] Intervalo entre mensagens: ${DELAY_BETWEEN_MESSAGES}s`);
  console.log(`[sendMessages] Midia anexada: ${MEDIA ? 'Sim' : 'Nao'}`);

  // Reset dos arrays de controle
  successfulContacts = [];
  failedContacts = [];

  for (let i = 0; i < CONTACTS.length; i++) {
    const contact = CONTACTS[i];
    try {
      console.log(`[sendMessages] Processando contato ${i + 1}/${CONTACTS.length}: ${contact}`);

      const chatId = await bot.getNumberId(contact);

      if (!chatId) {
        const reason = 'Contato nao encontrado no WhatsApp';
        console.log(`[sendMessages] ${reason}: ${contact}`);
        failedContacts.push({ phone: contact, reason });

        // Aplica delay mesmo para contatos não encontrados, exceto no último
        if (i < CONTACTS.length - 1) {
          await sleep(DELAY_BETWEEN_MESSAGES);
        }
        continue;
      }

      // Send message with or without media
      if (MEDIA) {
        await bot.sendMessage(chatId._serialized, MEDIA, { caption: MESSAGE });
        console.log(`[sendMessages] Mensagem com midia enviada com sucesso para ${contact}`);
      } else {
        await bot.sendMessage(chatId._serialized, MESSAGE);
        console.log(`[sendMessages] Mensagem enviada com sucesso para ${contact}`);
      }
      successfulContacts.push(contact);

      // Delay entre mensagens - só não aplica delay após a última mensagem
      if (i < CONTACTS.length - 1) {
        await sleep(DELAY_BETWEEN_MESSAGES);
      }

    } catch (error) {
      const reason = error.message || 'Erro desconhecido';
      console.error(`[sendMessages] Erro ao enviar mensagem para ${contact}: ${reason}`);
      failedContacts.push({ phone: contact, reason });

      // Aplica delay mesmo em caso de erro, exceto no último
      if (i < CONTACTS.length - 1) {
        await sleep(DELAY_BETWEEN_MESSAGES);
      }
    }
  }

  console.log('\n=== RESULTADO DOS ENVIOS ===');
  console.log(`Envios com sucesso: ${successfulContacts.length}/${CONTACTS.length}`);
  console.log(`Envios com falha: ${failedContacts.length}/${CONTACTS.length}`);
  console.log(`Taxa de sucesso: ${((successfulContacts.length / CONTACTS.length) * 100).toFixed(2)}%`);

  if (failedContacts.length > 0) {
    console.log('\nContatos com falha:');
    failedContacts.forEach((contact, index) => {
      console.log(`  ${index + 1}. ${contact.phone} - ${contact.reason}`);
    });
  }

  // Gera arquivos de log
  generateLogFiles();

  console.log('\n[sendMessages] Envio concluido para todos os contatos');
}

function checkFullyLoaded() {
  if (isAuthenticated && isReady && isFullyLoaded) {
    console.log('\n=== BOT PRONTO ===');
    console.log(`Contatos carregados: ${CONTACTS.length}`);
    console.log(`Mensagem: "${MESSAGE}"`);
    console.log(`Midia: ${MEDIA ? 'Sim (' + MEDIA.mimetype + ')' : 'Nenhuma midia anexada'}`);
    console.log(`Intervalo entre mensagens: ${DELAY_BETWEEN_MESSAGES}s`);
    console.log('\nPressione ENTER para iniciar o envio para todos os contatos...');

    waitForUserInput();
  }
}

function waitForUserInput() {
  rl.question('', async () => {
    console.log('\n[BOT] Iniciando envio das mensagens...');
    await sendMessages();
    console.log('\n[BOT] Envio das mensagens concluido');
    exit();
  });
}

const exit = () => {
  rl.close();
  bot.destroy();
  console.log('[BOT] Aplicacao encerrada.');
  process.exit(0);
};

// Bot events
bot.on('qr', qr => {
  console.log('[BOT] Gerando QR code...');
  qrcode.generate(qr, { small: true });
  console.log('Escaneie o QR code acima com o WhatsApp do seu celular');
});

bot.on('loading_screen', (percent, message) => {
  console.log(`[BOT] Carregando... ${percent}% - ${message}`);
});

bot.on('authenticated', () => {
  console.log('[BOT] Autenticacao concluida com sucesso');
  isAuthenticated = true;
  checkFullyLoaded();
});

bot.on('auth_failure', error => {
  console.error('[BOT] Falha na autenticacao:', error);
});

bot.on('ready', async () => {
  console.log('[BOT] Cliente do WhatsApp pronto');
  console.log(`[BOT] Versao do WhatsApp Web: ${await bot.getWWebVersion()}`);

  isReady = true;

  // Aguarda um pouco mais para garantir que tudo esteja carregado
  console.log('[BOT] Aguardando sincronizacao completa...');
  setTimeout(async () => {
    try {
      // Testa se consegue obter informações básicas
      const info = await bot.getState();
      console.log(`[BOT] Estado do WhatsApp: ${info}`);

      isFullyLoaded = true;
      checkFullyLoaded();
    } catch (error) {
      console.log('[BOT] Ainda sincronizando. Aguarde mais um pouco...');
      setTimeout(() => {
        isFullyLoaded = true;
        checkFullyLoaded();
      }, 5000);
    }
  }, 3000);
});

bot.on('disconnected', (reason) => {
  console.log('[BOT] Cliente desconectado:', reason);
  isAuthenticated = false;
  isReady = false;
  isFullyLoaded = false;
});

// Evento adicional para garantir que está totalmente sincronizado
bot.on('change_state', state => {
  console.log(`[BOT] Estado alterado para: ${state}`);
  if (state === 'CONNECTED') {
    console.log('[BOT] Conectado e sincronizado com sucesso');
  }
});

// Main execution
async function main() {
  console.log('\n=== INICIANDO WA-DELIVERY ===');

  const config = CONFIG;

  CSV_PHONE_KEY = config['csv-phone-key'] || 'MobilePhone';

  // Carrega contatos e mensagem usando o config.json
  CONTACTS = loadContacts(config['contacts-file'], CSV_PHONE_KEY);
  MESSAGE = loadMessage(config['message-file']);

  // Carrega mídia (opcional)
  MEDIA = loadMedia(config['media-file']);

  // Carrega o delay entre mensagens
  DELAY_BETWEEN_MESSAGES = config['delay-between-messages'] || 2;

  if (CONTACTS.length === 0) {
    console.log('[MAIN] Nenhum contato foi carregado. Verifique o arquivo CSV.');
    process.exit(1);
  }

  if (!MESSAGE || MESSAGE === '*default message*') {
    console.log('[MAIN] Nenhuma mensagem foi carregada. Verifique o arquivo de mensagem.');
    process.exit(1);
  }

  console.log('[MAIN] Configuracao carregada:');
  console.log(`  - Arquivo de contatos: ${config['contacts-file']}`);
  console.log(`  - Arquivo de mensagem: ${config['message-file']}`);
  console.log(`  - Arquivo de midia: ${config['media-file'] || 'Nao informado'}`);
  console.log(`  - Midia carregada: ${MEDIA ? 'Sim (' + MEDIA.mimetype + ')' : 'Nao'}`);
  console.log(`  - Intervalo entre mensagens: ${DELAY_BETWEEN_MESSAGES}s`);
  console.log(`  - Caminho do Chrome: ${config['chrome-executable-path'] || 'Deteccao automatica'}`);
  console.log(`  - Coluna do telefone no CSV: ${CSV_PHONE_KEY}`);
  console.log(`  - Quantidade de contatos: ${CONTACTS.length}`);
  console.log(`  - Previa da mensagem: "${MESSAGE.substring(0, 50)}${MESSAGE.length > 50 ? '...' : ''}"`);

  // Inicializa o bot
  console.log('\n[BOT] Iniciando cliente do WhatsApp...');
  console.log('[BOT] Aguarde a autenticacao e a sincronizacao completas...');
  bot.initialize();
}

// Process handlers
process.on('SIGINT', exit);  // CTRL+C
process.on('SIGQUIT', exit); // Keyboard quit
process.on('SIGTERM', exit); // `kill` command

// Start the application
main().catch(console.error);
