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
