const fs = require('fs');
const csv2json = require('convert-csv-to-json');

function loadContacts(filePath, phoneKey = 'MobilePhone') {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[loadContacts] Arquivo nao encontrado: ${filePath}`);
      return [];
    }

    const json = csv2json.fieldDelimiter(',').getJsonFromCsv(filePath);
    console.log('[loadContacts] CSV lido com sucesso');

    const contacts = [];

    for (const [, value] of Object.entries(json)) {
      // console.log('[loadContacts] Processando contato:', value);
      const mobilePhone = value[phoneKey];
      console.log('[loadContacts] Telefone encontrado:', mobilePhone);

      if (!mobilePhone) continue;

      // Extrai apenas os números do telefone
      const cleanPhone = mobilePhone.match(/\d/g)?.join('');

      if (cleanPhone) {
        contacts.push(cleanPhone);
      }
    }

    console.log(`[loadContacts] ${contacts.length} contatos carregados`);
    return contacts;
  } catch (error) {
    console.error('[loadContacts] Erro ao carregar contatos:', error);
    return [];
  }
}

module.exports = { loadContacts };
