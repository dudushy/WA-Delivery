//? Variables
const qrcode = require('qrcode-terminal');

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const fs = require('fs');

const csv2json = require('convert-csv-to-json');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const bot = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: CHROME_PATH,
    headless: process.argv[2] == '--show' ? false : true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let MEDIA = [];

let CONTACTS = [];

let MSG = '*default*';

//? Functions
function checkData() {
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data/media', { recursive: true });
  }

  if (!fs.existsSync('./data/MSG.txt')) {
    updateMsg(MSG);
  }

  console.log('[checkData] data checked');
}

function loadMedia() {
  fs.readdir('./data/media', (err, files) => {
    if (err) {
      console.log('[loadMedia] error reading directory', err);
    } else {
      MEDIA = files;
      console.log('[loadMedia] media loaded', MEDIA);
    }
  });
}

function loadContacts() {
  const json = csv2json.fieldDelimiter(',').getJsonFromCsv('./data/contacts.csv');
  console.log('[loadContacts] json', json);

  for (const [, value] of Object.entries(json)) {
    const contact = (value['Phone1-Value'] || value['Phone2-Value'] || value['Phone3-Value'] || null)?.match(/\d/g)?.join('');

    if (contact) CONTACTS.push(contact);
  }

  console.log('[loadContacts] contacts loaded', CONTACTS);
}

function updateMsg(newData) {
  fs.writeFile('./data/MSG.txt', newData, err => {
    if (err) {
      console.log('[updateMsg] error writing file', err);
    } else {
      console.log('[updateMsg] successfully wrote file');
    }
  });
}

function loadMsg() {
  fs.readFile('./data/MSG.txt', 'utf8', (err, msg) => {
    if (err) {
      console.log('[loadMsg] error reading file from disk:', err);
      updateMsg(MSG);

      return;
    }

    try {
      MSG = msg;
      console.log('[loadMsg] MSG loaded from disk:', MSG);
    } catch (err) {
      console.log('[loadMsg] error parsing text:', err);
      updateMsg(MSG);
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
  for (const contact of CONTACTS) {
    try {
      const chatId = await bot.getNumberId(contact.match(/\d/g).join(''));
      // console.log('[sendMessages] chatId', chatId._serialized);

      await bot.sendMessage(chatId._serialized, MSG);
      console.log('[sendMessages/txt] sent');

      for (const [key, value] of Object.entries(MEDIA)) {
        const media = MessageMedia.fromFilePath(`./data/media/${value}`);
        // console.log(`[sendMessages/media] #${key} (${value})`, media);

        await bot.sendMessage(chatId._serialized, media, { caption: '' });
        console.log(`[sendMessages/media] #${key} (${value}) sent`);
      }

      console.log(`[sendMessages] #${CONTACTS.indexOf(contact)} (${chatId.user}) done`);
    } catch (err) {
      console.log('[sendMessages] error', err);
    }
  }
}

// eslint-disable-next-line no-unused-vars
async function confirmLastMsg() {
  if (CONTACTS.length == 0) return true;

  const lastCtt = CONTACTS[CONTACTS.length - 1].match(/\d/g).join('');
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

  console.log('[bot#ready] WhatsApp Web version:', await bot.getWWebVersion());
  console.log('[bot#ready] WWebJS version:', require('whatsapp-web.js').version);

  await sendMessages();

  // while (await confirmLastMsg() == false) {
  //   await sleep(1);
  // }

  await sleep(5);

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

checkData();
loadMedia();
loadMsg();
loadContacts();

bot.initialize();

process.on('SIGINT', exit);  // CTRL+C
process.on('SIGQUIT', exit); // Keyboard quit
process.on('SIGTERM', exit); // `kill` command
