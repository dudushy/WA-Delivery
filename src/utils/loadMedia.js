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
    console.log('[loadMedia] No media path provided');
    return null;
  }

  const absolutePath = path.resolve(mediaPath);

  if (!fs.existsSync(absolutePath)) {
    console.log(`[loadMedia] ⚠️ Media file not found: ${absolutePath}`);
    return null;
  }

  try {
    const media = MessageMedia.fromFilePath(absolutePath);
    console.log(`[loadMedia] ✅ Media loaded successfully: ${absolutePath}`);
    console.log(`[loadMedia] 📎 MIME type: ${media.mimetype}`);
    return media;
  } catch (error) {
    console.error(`[loadMedia] ❌ Error loading media: ${error.message}`);
    return null;
  }
}

module.exports = { loadMedia };
