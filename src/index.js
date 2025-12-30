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

// Configuração do readline para capturar ENTER
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const bot = new Client({
  authStrategy: new LocalAuth({
    clientId: 'wa-delivery',
  }),
  webVersionCache: {
    type: 'local',
  },
  puppeteer: {
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
    ],
    path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Altere este caminho se necessário
  },
});

let CONTACTS = [];
let MESSAGE = '';
let MEDIA = null;
let DELAY_BETWEEN_MESSAGES = 2; // Valor padrão
let isAuthenticated = false;
let isReady = false;
let isFullyLoaded = false;

// Arrays para controlar sucessos e falhas
let successfulContacts = [];
let failedContacts = [];

function sleep(seconds) {
  return new Promise(resolve => {
    console.log(`[sleep] Waiting ${seconds}s...`);
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
        '=== SUCCESSFUL DELIVERIES ===',
        `Timestamp: ${new Date().toISOString()}`,
        `Total successful: ${successfulContacts.length}`,
        `Message sent: "${MESSAGE}"`,
        `Media attached: ${MEDIA ? 'Yes' : 'No'}`,
        '',
        'Phone numbers:',
        ...successfulContacts.map((contact, index) => `${index + 1}. ${contact}`)
      ].join('\n');

      fs.writeFileSync(successLogPath, successContent, 'utf8');
      console.log(`[LOG] ✅ Successful contacts log saved: ${successLogPath}`);
    }

    // Gera log de falhas
    if (failedContacts.length > 0) {
      const failedLogPath = path.join(logsDir, `failed_contacts_${timestamp}.txt`);
      const failedContent = [
        '=== FAILED DELIVERIES ===',
        `Timestamp: ${new Date().toISOString()}`,
        `Total failed: ${failedContacts.length}`,
        `Message attempted: "${MESSAGE}"`,
        `Media attached: ${MEDIA ? 'Yes' : 'No'}`,
        '',
        'Failed contacts (Phone Number - Reason):',
        ...failedContacts.map((contact, index) => `${index + 1}. ${contact.phone} - ${contact.reason}`)
      ].join('\n');

      fs.writeFileSync(failedLogPath, failedContent, 'utf8');
      console.log(`[LOG] ❌ Failed contacts log saved: ${failedLogPath}`);
    }

    // Gera resumo geral
    const summaryLogPath = path.join(logsDir, `delivery_summary_${timestamp}.txt`);
    const summaryContent = [
      '=== DELIVERY SUMMARY ===',
      `Timestamp: ${new Date().toISOString()}`,
      `Total contacts processed: ${CONTACTS.length}`,
      `Successful deliveries: ${successfulContacts.length}`,
      `Failed deliveries: ${failedContacts.length}`,
      `Success rate: ${((successfulContacts.length / CONTACTS.length) * 100).toFixed(2)}%`,
      `Message: "${MESSAGE}"`,
      `Media attached: ${MEDIA ? 'Yes (' + MEDIA.mimetype + ')' : 'No'}`,
      `Delay between messages: ${DELAY_BETWEEN_MESSAGES}s`,
      '',
      '=== DETAILED RESULTS ===',
      '',
      '✅ Successful:',
      ...successfulContacts.map((contact, index) => `  ${index + 1}. ${contact}`),
      '',
      '❌ Failed:',
      ...failedContacts.map((contact, index) => `  ${index + 1}. ${contact.phone} - ${contact.reason}`)
    ].join('\n');

    fs.writeFileSync(summaryLogPath, summaryContent, 'utf8');
    console.log(`[LOG] 📊 Summary log saved: ${summaryLogPath}`);

  } catch (error) {
    console.error('[LOG] Error generating log files:', error);
  }
}

async function sendMessages() {
  if (CONTACTS.length === 0) {
    console.log('[sendMessages] No contacts to send messages to');
    return;
  }

  console.log(`[sendMessages] Starting to send messages to ${CONTACTS.length} contacts...`);
  console.log(`[sendMessages] Delay between messages: ${DELAY_BETWEEN_MESSAGES}s`);
  console.log(`[sendMessages] Media attached: ${MEDIA ? 'Yes' : 'No'}`);

  // Reset dos arrays de controle
  successfulContacts = [];
  failedContacts = [];

  for (let i = 0; i < CONTACTS.length; i++) {
    const contact = CONTACTS[i];
    try {
      console.log(`[sendMessages] Processing contact ${i + 1}/${CONTACTS.length}: ${contact}`);

      const chatId = await bot.getNumberId(contact);

      if (!chatId) {
        const reason = 'Contact not found on WhatsApp';
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
        console.log(`[sendMessages] Message with media sent successfully to ${contact}`);
      } else {
        await bot.sendMessage(chatId._serialized, MESSAGE);
        console.log(`[sendMessages] Message sent successfully to ${contact}`);
      }
      successfulContacts.push(contact);

      // Delay entre mensagens - só não aplica delay após a última mensagem
      if (i < CONTACTS.length - 1) {
        await sleep(DELAY_BETWEEN_MESSAGES);
      }

    } catch (error) {
      const reason = error.message || 'Unknown error';
      console.error(`[sendMessages] Error sending message to ${contact}: ${reason}`);
      failedContacts.push({ phone: contact, reason });

      // Aplica delay mesmo em caso de erro, exceto no último
      if (i < CONTACTS.length - 1) {
        await sleep(DELAY_BETWEEN_MESSAGES);
      }
    }
  }

  console.log('\n=== DELIVERY RESULTS ===');
  console.log(`✅ Successful deliveries: ${successfulContacts.length}/${CONTACTS.length}`);
  console.log(`❌ Failed deliveries: ${failedContacts.length}/${CONTACTS.length}`);
  console.log(`📊 Success rate: ${((successfulContacts.length / CONTACTS.length) * 100).toFixed(2)}%`);

  if (failedContacts.length > 0) {
    console.log('\n❌ Failed contacts:');
    failedContacts.forEach((contact, index) => {
      console.log(`  ${index + 1}. ${contact.phone} - ${contact.reason}`);
    });
  }

  // Gera arquivos de log
  generateLogFiles();

  console.log('\n[sendMessages] Finished sending messages to all contacts');
}

function checkFullyLoaded() {
  if (isAuthenticated && isReady && isFullyLoaded) {
    console.log('\n🟢 === BOT FULLY READY ===');
    console.log(`✅ Contacts loaded: ${CONTACTS.length}`);
    console.log(`✅ Message: "${MESSAGE}"`);
    console.log(`✅ Media: ${MEDIA ? 'Yes (' + MEDIA.mimetype + ')' : 'No media attached'}`);
    console.log(`✅ Delay between messages: ${DELAY_BETWEEN_MESSAGES}s`);
    console.log('\n🚀 Press ENTER to start sending messages to all contacts...');

    waitForUserInput();
  }
}

function waitForUserInput() {
  rl.question('', async () => {
    console.log('\n[BOT] Starting message delivery...');
    await sendMessages();
    console.log('\n[BOT] Message delivery completed!');
    exit();
  });
}

const exit = () => {
  rl.close();
  bot.destroy();
  console.log('[BOT] Application finished.');
  process.exit(0);
};

// Bot events
bot.on('qr', qr => {
  console.log('[BOT] 📱 Generating QR code...');
  qrcode.generate(qr, { small: true });
  console.log('📲 Scan the QR code above with your WhatsApp mobile app');
});

bot.on('loading_screen', (percent, message) => {
  console.log(`[BOT] ⏳ Loading... ${percent}% - ${message}`);
});

bot.on('authenticated', () => {
  console.log('[BOT] ✅ Successfully authenticated!');
  isAuthenticated = true;
  checkFullyLoaded();
});

bot.on('auth_failure', error => {
  console.error('[BOT] ❌ Authentication failed:', error);
});

bot.on('ready', async () => {
  console.log('[BOT] ✅ WhatsApp client is ready!');
  console.log(`[BOT] 📱 WhatsApp Web version: ${await bot.getWWebVersion()}`);

  isReady = true;

  // Aguarda um pouco mais para garantir que tudo esteja carregado
  console.log('[BOT] ⏳ Waiting for full synchronization...');
  setTimeout(async () => {
    try {
      // Testa se consegue obter informações básicas
      const info = await bot.getState();
      console.log(`[BOT] 📊 WhatsApp state: ${info}`);

      isFullyLoaded = true;
      checkFullyLoaded();
    } catch (error) {
      console.log('[BOT] ⚠️ Still synchronizing, waiting more...');
      setTimeout(() => {
        isFullyLoaded = true;
        checkFullyLoaded();
      }, 5000);
    }
  }, 3000);
});

bot.on('disconnected', (reason) => {
  console.log('[BOT] ❌ Client disconnected:', reason);
  isAuthenticated = false;
  isReady = false;
  isFullyLoaded = false;
});

// Evento adicional para garantir que está totalmente sincronizado
bot.on('change_state', state => {
  console.log(`[BOT] 🔄 State changed to: ${state}`);
  if (state === 'CONNECTED') {
    console.log('[BOT] ✅ Fully connected and synchronized!');
  }
});

// Main execution
async function main() {
  console.log('\n=== 🤖 WA-Delivery BOT Starting ===');

  // Carrega configuração
  const config = loadConfig();

  // Carrega contatos e mensagem usando o config.json
  CONTACTS = loadContacts(config['contacts-file']);
  MESSAGE = loadMessage(config['message-file']);

  // Carrega mídia (opcional)
  MEDIA = loadMedia(config['media-file']);

  // Carrega o delay entre mensagens
  DELAY_BETWEEN_MESSAGES = config['delay-between-messages'] || 2;

  if (CONTACTS.length === 0) {
    console.log('[MAIN] ❌ No contacts loaded. Please check your CSV file.');
    process.exit(1);
  }

  if (!MESSAGE || MESSAGE === '*default message*') {
    console.log('[MAIN] ❌ No message loaded. Please check your message file.');
    process.exit(1);
  }

  console.log('[MAIN] ✅ Configuration loaded:');
  console.log(`  - Contacts file: ${config['contacts-file']}`);
  console.log(`  - Message file: ${config['message-file']}`);
  console.log(`  - Media file: ${config['media-file'] || 'Not specified'}`);
  console.log(`  - Media loaded: ${MEDIA ? 'Yes (' + MEDIA.mimetype + ')' : 'No'}`);
  console.log(`  - Delay between messages: ${DELAY_BETWEEN_MESSAGES}s`);
  console.log(`  - Contacts count: ${CONTACTS.length}`);
  console.log(`  - Message preview: "${MESSAGE.substring(0, 50)}${MESSAGE.length > 50 ? '...' : ''}"`);

  // Inicializa o bot
  console.log('\n[BOT] 🚀 Initializing WhatsApp client...');
  console.log('[BOT] ⏳ Please wait for complete authentication and synchronization...');
  bot.initialize();
}

// Process handlers
process.on('SIGINT', exit);  // CTRL+C
process.on('SIGQUIT', exit); // Keyboard quit
process.on('SIGTERM', exit); // `kill` command

// Start the application
main().catch(console.error);
