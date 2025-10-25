const fs = require('fs');

function loadMessage(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[loadMessage] File not found: ${filePath}`);
      return '*default message*';
    }

    const message = fs.readFileSync(filePath, 'utf8').trim();
    console.log('[loadMessage] Message loaded successfully');
    return message;
  } catch (error) {
    console.error('[loadMessage] Error loading message:', error);
    return '*default message*';
  }
}

module.exports = { loadMessage };
