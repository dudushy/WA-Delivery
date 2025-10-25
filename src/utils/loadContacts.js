const fs = require('fs');
const csv2json = require('convert-csv-to-json');

function loadContacts(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[loadContacts] File not found: ${filePath}`);
      return [];
    }

    const json = csv2json.fieldDelimiter(',').getJsonFromCsv(filePath);
    console.log('[loadContacts] CSV parsed successfully');

    const contacts = [];

    for (const [, value] of Object.entries(json)) {
      // Procura pelo campo 'MobilePhone' no CSV
      const mobilePhone = value['MobilePhone'];
      console.log('[loadContacts] Found mobile phone:', mobilePhone);

      if (!mobilePhone) continue;

      // Extrai apenas os números do telefone
      const cleanPhone = mobilePhone.match(/\d/g)?.join('');

      if (cleanPhone) {
        contacts.push(cleanPhone);
      }
    }

    console.log(`[loadContacts] ${contacts.length} contacts loaded`);
    return contacts;
  } catch (error) {
    console.error('[loadContacts] Error loading contacts:', error);
    return [];
  }
}

module.exports = { loadContacts };
