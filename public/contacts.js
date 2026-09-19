const form = document.querySelector('#manual-list-form');
const listName = document.querySelector('#list-name');
const rows = document.querySelector('#contact-rows');
const addButton = document.querySelector('#add-contact');
const errors = document.querySelector('#form-errors');
const savedLists = document.querySelector('#saved-lists');
const uploadForm = document.querySelector('#csv-upload-form');
const csvFile = document.querySelector('#csv-file');
const csvErrors = document.querySelector('#csv-errors');
const csvPreview = document.querySelector('#csv-preview');
const csvAnalysis = document.querySelector('#csv-analysis');
const fileSummary = document.querySelector('#csv-file-summary');
const phoneColumn = document.querySelector('#phone-column');
const nameColumn = document.querySelector('#name-column');
const previewTable = document.querySelector('#preview-table');
const analysisCards = document.querySelector('#analysis-cards');
const analysisTable = document.querySelector('#analysis-table');
const importListName = document.querySelector('#import-list-name');
const analyzeMapping = document.querySelector('#analyze-mapping');
const confirmImport = document.querySelector('#confirm-import');
let currentPreview;

function addContactRow(contact = { name: '', phone: '' }) {
  const row = document.createElement('div');
  row.className = 'contact-row';
  row.innerHTML = `
    <label>Nome<input class="contact-name" autocomplete="name" required></label>
    <label>Telefone<input class="contact-phone" inputmode="tel" placeholder="(16) 99999-9999" required></label>
    <button class="remove-contact danger" type="button" aria-label="Remover contato">Remover</button>
  `;
  row.querySelector('.contact-name').value = contact.name;
  row.querySelector('.contact-phone').value = contact.phone;
  row.querySelector('.remove-contact').addEventListener('click', () => {
    if (rows.children.length > 1) row.remove();
  });
  rows.append(row);
}

function readContacts() {
  return [...rows.querySelectorAll('.contact-row')].map((row) => ({
    name: row.querySelector('.contact-name').value,
    phone: row.querySelector('.contact-phone').value,
  }));
}

function showErrors(issues) {
  errors.hidden = issues.length === 0;
  errors.innerHTML = issues.map((issue) => `<div>${escapeHtml(issue.message)}</div>`).join('');
}

function showCsvError(message = '') {
  csvErrors.hidden = !message;
  csvErrors.textContent = message;
}

function options(headers, selected, emptyLabel) {
  const empty = emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : '';
  return empty + headers.map((header) =>
    `<option value="${escapeHtml(header)}" ${header === selected ? 'selected' : ''}>${escapeHtml(header)}</option>`
  ).join('');
}

function renderTable(table, headers, records) {
  table.innerHTML = `
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
    <tbody>${records.map((record) => `<tr>${headers.map((header) =>
      `<td>${escapeHtml(record[header] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
  `;
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? 'Falha ao processar a solicitação.');
  return result;
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

async function loadLists() {
  const response = await fetch('/api/contact-lists');
  const { items } = await response.json();
  savedLists.innerHTML = items.length === 0
    ? '<p>Nenhuma lista cadastrada.</p>'
    : items.map((item) => `
        <a class="saved-list" href="/contact-list.html?id=${item.id}">
          <div><strong>${escapeHtml(item.name)}</strong><span>${item.source === 'manual' ? 'Manual' : 'CSV'}</span></div>
          <b>${item.contactCount} contato${item.contactCount === 1 ? '' : 's'}</b>
        </a>
      `).join('');
}

addButton.addEventListener('click', () => addContactRow());

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showCsvError();
  csvPreview.hidden = true;
  csvAnalysis.hidden = true;
  const submitButton = uploadForm.querySelector('button');
  submitButton.disabled = true;
  try {
    const formData = new FormData();
    formData.append('file', csvFile.files[0]);
    const response = await fetch('/api/contact-imports/preview', { method: 'POST', body: formData });
    const preview = await response.json();
    if (!response.ok) throw new Error(preview.message ?? 'Não foi possível analisar o CSV.');
    currentPreview = preview;
    fileSummary.textContent = `${preview.filename} — ${preview.rowCount} linhas — ${preview.encoding} — separador ${preview.delimiter}`;
    phoneColumn.innerHTML = options(
      preview.headers,
      preview.phoneCandidates[0]?.header,
    );
    nameColumn.innerHTML = options(
      preview.headers,
      preview.nameCandidates[0]?.header,
      'Não usar coluna de nome',
    );
    renderTable(previewTable, preview.headers, preview.rows);
    importListName.value = preview.filename.replace(/\.csv$/i, '');
    csvPreview.hidden = false;
  } catch (error) {
    showCsvError(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

analyzeMapping.addEventListener('click', async () => {
  showCsvError();
  analyzeMapping.disabled = true;
  try {
    const analysis = await postJson('/api/contact-imports/analyze', {
      previewId: currentPreview.previewId,
      phoneColumn: phoneColumn.value,
      nameColumn: nameColumn.value,
    });
    analysisCards.innerHTML = [
      ['Total', analysis.total, ''],
      ['Válidos', analysis.valid, 'success'],
      ['Inválidos', analysis.invalid, 'error-tone'],
      ['Duplicados', analysis.duplicates, 'warning'],
    ].map(([label, value, tone]) => `<div class="metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`).join('');
    renderTable(analysisTable, ['Linha', 'Nome', 'Telefone', 'Status', 'Motivo'], analysis.sample.map((row) => ({
      Linha: row.rowNumber,
      Nome: row.name,
      Telefone: row.phone,
      Status: row.status === 'valid' ? 'Válido' : row.status === 'duplicate' ? 'Duplicado' : 'Inválido',
      Motivo: row.reason ?? '',
    })));
    csvAnalysis.hidden = false;
  } catch (error) {
    showCsvError(error.message);
  } finally {
    analyzeMapping.disabled = false;
  }
});

confirmImport.addEventListener('click', async () => {
  showCsvError();
  confirmImport.disabled = true;
  try {
    await postJson('/api/contact-imports/confirm', {
      previewId: currentPreview.previewId,
      listName: importListName.value,
      phoneColumn: phoneColumn.value,
      nameColumn: nameColumn.value,
    });
    uploadForm.reset();
    csvPreview.hidden = true;
    csvAnalysis.hidden = true;
    currentPreview = undefined;
    await loadLists();
  } catch (error) {
    showCsvError(error.message);
  } finally {
    confirmImport.disabled = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showErrors([]);
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/contact-lists/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: listName.value, contacts: readContacts() }),
    });
    const body = await response.json();
    if (!response.ok) {
      showErrors(body.issues ?? [{ message: body.message ?? 'Não foi possível salvar a lista.' }]);
      return;
    }

    form.reset();
    rows.replaceChildren();
    addContactRow();
    await loadLists();
  } catch (error) {
    showErrors([{ message: `Falha ao comunicar com a aplicação: ${error.message}` }]);
  } finally {
    submitButton.disabled = false;
  }
});

addContactRow();
loadLists().catch((error) => {
  savedLists.innerHTML = `<p class="error">Falha ao carregar listas: ${escapeHtml(error.message)}</p>`;
});
