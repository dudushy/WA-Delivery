//? Variables
const qrcode = require('qrcode-terminal');

const moment = require('moment-timezone');
moment.tz.setDefault('America/Sao_Paulo');

const { Client, LocalAuth } = require('whatsapp-web.js');

const fs = require('fs');

const bot = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: process.argv[2] == '--show' ? false : true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let data = [];

const MSG = '*test*';

//? Functions
function updateData(newData) {
  fs.writeFile('./data.json', JSON.stringify(newData), err => {
    if (err) {
      console.log('[updateData] error writing file', err);
    } else {
      console.log('[updateData] successfully wrote file');
    }
  });
}

function readData() {
  fs.readFile('./data.json', 'utf8', (err, jsonString) => {
    if (err) {
      console.log('[data] error reading file from disk:', err);
      updateData(data);

      return;
    }

    try {
      data = JSON.parse(jsonString);
      console.log('[data] data loaded from disk:', data);
    } catch (err) {
      console.log('[data] error parsing JSON string:', err);
      updateData(data);
    }
  });
}

const exit = () => {
  bot.destroy();
  console.log('[bot] finished.');
};

function sleep(seconds) {
  return new Promise(resolve => { console.log(`[sleep] ${seconds}s`); setTimeout(resolve, seconds * 1000); });
}

async function sendMessages() {
  for (const contact of data) {
    try {
      const chatId = await bot.getNumberId(contact.match(/\d/g).join(''));
      // console.log('[sendMessages] chatId', chatId._serialized);

      await bot.sendMessage(chatId._serialized, MSG);

      console.log(`[sendMessages] #${data.indexOf(contact)} (${chatId.user}) sent`);
    } catch (err) {
      console.log('[sendMessages] error', err);
    }
  }
}

async function confirmLastMsg() {
  const lastCtt = data[data.length - 1].match(/\d/g).join('');
  console.log('[confirmLastMsg] lastCtt', lastCtt);

  const chatId = await bot.getNumberId(lastCtt);
  console.log('[confirmLastMsg] chatId', chatId);

  const chat = await bot.getChatById(chatId._serialized);
  console.log('[confirmLastMsg] lastMsg', chat);

  const lastMsg = await chat.fetchMessages({ limit: 1 });
  console.log('[confirmLastMsg] lastMsg', lastMsg);

  const result = lastMsg[0].body == MSG;
  console.log('[confirmLastMsg] result', result);
  return result;
}

bot.on('qr', qr => {
  console.log('[bot#qr] generating...');
  qrcode.generate(qr, { small: true });

  // updateData([]);
});

bot.on('loading_screen', (percent, message) => {
  console.log(`[bot#loading_screen] ${percent}%`, message);
});

bot.on('authenticated', (session) => {
  console.log('[bot#authenticated] client is authenticated!', session);
});

bot.on('auth_failure', error => {
  console.error('[bot#auth_failure] ERROR', error);
});

bot.on('ready', async () => {
  console.log('[bot#ready] client is ready!');

  await sendMessages();

  while (await confirmLastMsg() == false) {
    await sleep(5);
  }

  exit();
});

bot.on('disconnected', (reason) => {
  console.log('[bot#disconnected] client disconnected', reason);
});

bot.on('message', msg => {
  console.log('[bot#message] received', msg);

  if (msg.body == '!ping') {
    msg.reply('pong');
  }
});

//? Main
console.log('\n[bot] starting...');

readData();

bot.initialize();

process.on('SIGINT', exit);  // CTRL+C
process.on('SIGQUIT', exit); // Keyboard quit
process.on('SIGTERM', exit); // `kill` command
