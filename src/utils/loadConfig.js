const fs = require('fs');

function loadConfig(configPath = './config.json') {
  try {
    if (!fs.existsSync(configPath)) {
      console.log(`[loadConfig] Config file not found: ${configPath}`);
      return {
        'message-file': 'data/message.txt',
        'contacts-file': 'data/contacts.csv'
      };
    }

    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    console.log('[loadConfig] Configuration loaded successfully');
    return config;
  } catch (error) {
    console.error('[loadConfig] Error loading config:', error);
    return {
      'message-file': 'data/message.txt',
      'contacts-file': 'data/contacts.csv'
    };
  }
}

module.exports = { loadConfig };
