//? Variables
const qrcode = require('qrcode-terminal');

const moment = require('moment-timezone');
moment.tz.setDefault('America/Sao_Paulo');

const { Client, LocalAuth } = require('whatsapp-web.js');

const fs = require('fs');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: process.argv[2] == '--show' ? false : true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let data = [];

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

const exit = () => {
  client.destroy();
  console.log('[bot] finished.');
};

client.on('qr', qr => {
  console.log('[bot#qr] generating...');
  qrcode.generate(qr, { small: true });

  updateData([]);
});

client.on('loading_screen', (percent, message) => {
  console.log(`[bot#loading_screen] ${percent}%`, message);
});

client.on('authenticated', (session) => {
  console.log('[bot#authenticated] client is authenticated!', session);
});

client.on('auth_failure', error => {
  console.error('[bot#auth_failure] ERROR', error);
});

client.on('ready', () => {
  console.log('[bot#ready] client is ready!');
});

client.on('disconnected', (reason) => {
  console.log('[bot#disconnected] client disconnected', reason);
});

client.on('message', msg => {
  console.log('[bot#message] received', msg);

  if (msg.body == '!ping') {
    msg.reply('pong');
  }
});

//? Main
console.log('\n[bot] starting...');

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

client.initialize();

process.on('SIGINT', exit);  // CTRL+C
process.on('SIGQUIT', exit); // Keyboard quit
process.on('SIGTERM', exit); // `kill` command
