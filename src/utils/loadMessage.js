const fs = require('fs');

function loadMessage(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[loadMessage] Arquivo nao encontrado: ${filePath}`);
      return '*default message*';
    }

    const message = fs.readFileSync(filePath, 'utf8').trim();
    console.log('[loadMessage] Mensagem carregada com sucesso');
    return message;
  } catch (error) {
    console.error('[loadMessage] Erro ao carregar mensagem:', error);
    return '*default message*';
  }
}

module.exports = { loadMessage };
