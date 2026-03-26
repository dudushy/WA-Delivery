const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

/**
 * Loads media from file path for WhatsApp messaging
 * @param {string} mediaPath - Path to the media file
 * @returns {MessageMedia|null} - MessageMedia object or null if not found
 */
function loadMedia(mediaPath) {
  if (!mediaPath) {
    console.log('[loadMedia] Nenhum caminho de midia foi informado');
    return null;
  }

  const absolutePath = path.resolve(mediaPath);

  if (!fs.existsSync(absolutePath)) {
    console.log(`[loadMedia] Arquivo de midia nao encontrado: ${absolutePath}`);
    return null;
  }

  try {
    const media = MessageMedia.fromFilePath(absolutePath);
    console.log(`[loadMedia] Midia carregada com sucesso: ${absolutePath}`);
    console.log(`[loadMedia] Tipo de arquivo: ${media.mimetype}`);
    return media;
  } catch (error) {
    console.error(`[loadMedia] Erro ao carregar midia: ${error.message}`);
    return null;
  }
}

module.exports = { loadMedia };
