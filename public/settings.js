const form = document.querySelector('#settings-form');
const errorBox = document.querySelector('#settings-error');
const successBox = document.querySelector('#settings-success');
const saveButton = document.querySelector('#save-button');

const NUMERIC_FIELDS = [
  'operationTimeoutMs',
  'maxAttempts',
  'retryBackoffMs',
  'retryBackoffCapMs',
  'retentionDays',
];
const TEXT_FIELDS = ['defaultCountryCode', 'defaultAreaCode'];

function fill(settings) {
  for (const field of [...TEXT_FIELDS, ...NUMERIC_FIELDS]) {
    const input = document.querySelector(`#${field}`);
    if (input) input.value = settings[field];
  }
  const sound = document.querySelector('#soundEnabled');
  if (sound) sound.checked = Boolean(settings.soundEnabled);
}

function collect() {
  const payload = {};
  for (const field of TEXT_FIELDS) {
    payload[field] = document.querySelector(`#${field}`).value.trim();
  }
  for (const field of NUMERIC_FIELDS) {
    payload[field] = Number(document.querySelector(`#${field}`).value);
  }
  payload.soundEnabled = document.querySelector('#soundEnabled').checked;
  return payload;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  successBox.hidden = true;
}

function showSuccess() {
  successBox.hidden = false;
  errorBox.hidden = true;
}

async function load() {
  try {
    const response = await fetch('/api/settings');
    if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
    fill(await response.json());
  } catch (error) {
    showError(`Não foi possível carregar as configurações: ${error.message}`);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  errorBox.hidden = true;
  successBox.hidden = true;
  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    });
    if (response.status === 422) {
      const body = await response.json();
      const details = (body.issues ?? []).map((issue) => issue.message).join(' ');
      showError(details || body.message || 'Configurações inválidas.');
      return;
    }
    if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
    fill(await response.json());
    showSuccess();
  } catch (error) {
    showError(`Não foi possível salvar as configurações: ${error.message}`);
  } finally {
    saveButton.disabled = false;
  }
});

void load();

const cleanupButton = document.querySelector('#cleanup-button');
const cleanupMessage = document.querySelector('#cleanup-message');
const cleanupError = document.querySelector('#cleanup-error');

cleanupButton.addEventListener('click', async () => {
  if (!confirm('Remover definitivamente as campanhas finalizadas mais antigas que a retenção configurada? Esta ação não pode ser desfeita.')) {
    return;
  }
  cleanupButton.disabled = true;
  cleanupMessage.hidden = true;
  cleanupError.hidden = true;
  try {
    const response = await fetch('/api/campaigns/cleanup', { method: 'POST' });
    const body = await response.json();
    if (response.status === 422) {
      cleanupError.textContent = body.message || 'Retenção desativada.';
      cleanupError.hidden = false;
      return;
    }
    if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
    cleanupMessage.textContent = `${body.removed} campanha(s) removida(s) (retenção de ${body.retentionDays} dias).`;
    cleanupMessage.hidden = false;
  } catch (error) {
    cleanupError.textContent = `Não foi possível executar a limpeza: ${error.message}`;
    cleanupError.hidden = false;
  } finally {
    cleanupButton.disabled = false;
  }
});

const restoreForm = document.querySelector('#restore-form');
const restoreFile = document.querySelector('#restore-file');
const restoreButton = document.querySelector('#restore-button');
const restoreMessage = document.querySelector('#restore-message');
const restoreError = document.querySelector('#restore-error');

restoreForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = restoreFile.files[0];
  if (!file) return;
  if (!confirm('Restaurar substitui os dados atuais (banco, mídias e sessão do WhatsApp). Um backup de segurança será criado antes. Continuar?')) {
    return;
  }
  restoreButton.disabled = true;
  restoreMessage.hidden = true;
  restoreError.hidden = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/backup/restore', { method: 'POST', body });
    const data = await response.json();
    if (!response.ok) {
      restoreError.textContent = data.message || 'Falha ao restaurar o backup.';
      restoreError.hidden = false;
      return;
    }
    restoreMessage.textContent = data.message || 'Backup restaurado. A aplicação será reiniciada.';
    restoreMessage.hidden = false;
  } catch (error) {
    restoreError.textContent = `Não foi possível restaurar: ${error.message}`;
    restoreError.hidden = false;
  } finally {
    restoreButton.disabled = false;
  }
});
