const fs = require('fs');

function loadConfig(configPath = './config.json') {
  try {
    if (!fs.existsSync(configPath)) {
      console.log(`[loadConfig] Arquivo de configuracao nao encontrado: ${configPath}`);
      return {
        'chrome-executable-path': '',
        'csv-phone-key': 'MobilePhone',
        'delay-between-messages': 2,
        'message-file': 'data/message.txt',
        'contacts-file': 'data/contacts.csv'
      };
    }

    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    console.log('[loadConfig] Configuracao carregada com sucesso');
    return config;
  } catch (error) {
    console.error('[loadConfig] Erro ao carregar configuracao:', error);
    return {
      'chrome-executable-path': '',
      'csv-phone-key': 'MobilePhone',
      'delay-between-messages': 2,
      'message-file': 'data/message.txt',
      'contacts-file': 'data/contacts.csv'
    };
  }
}

module.exports = { loadConfig };
