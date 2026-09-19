const form = document.querySelector('#campaign-form');
const campaignName = document.querySelector('#campaign-name');
const contactList = document.querySelector('#campaign-list');
const messageTemplate = document.querySelector('#message-template');
const messageCounter = document.querySelector('#message-counter');
const delayMin = document.querySelector('#delay-min');
const delayMax = document.querySelector('#delay-max');
const insertName = document.querySelector('#insert-name');
const saveDraft = document.querySelector('#save-draft');
const errorPanel = document.querySelector('#campaign-error');
const simulationPanel = document.querySelector('#simulation-panel');
const simulationCards = document.querySelector('#simulation-cards');
const durationSummary = document.querySelector('#duration-summary');
const messageSamples = document.querySelector('#message-samples');
const drafts = document.querySelector('#campaign-drafts');
let lastSimulationInput;

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value);
  return node.innerHTML;
}

function showError(message = '') {
  errorPanel.hidden = !message;
  errorPanel.textContent = message;
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.issues?.map((issue) => issue.message).join(' ') || body.message || 'Falha na solicitação.');
  }
  return body;
}

function readInput() {
  return {
    name: campaignName.value,
    contactListId: Number(contactList.value),
    messageTemplate: messageTemplate.value,
    delayMinSeconds: Number(delayMin.value),
    delayMaxSeconds: Number(delayMax.value),
  };
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours && `${hours}h`, minutes && `${minutes}min`, `${seconds}s`].filter(Boolean).join(' ');
}

function renderSimulation(simulation) {
  simulationCards.innerHTML = [
    ['Destinatários', simulation.recipientCount],
    ['Intervalo mínimo', `${simulation.delayMinSeconds}s`],
    ['Intervalo médio', `${(simulation.delayMinSeconds + simulation.delayMaxSeconds) / 2}s`],
    ['Intervalo máximo', `${simulation.delayMaxSeconds}s`],
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
  durationSummary.textContent = `Duração estimada: entre ${formatDuration(simulation.durationMinSeconds)} e ${formatDuration(simulation.durationMaxSeconds)}; média de ${formatDuration(simulation.durationAverageSeconds)}.`;
  messageSamples.innerHTML = simulation.samples.map((sample) => `
    <article class="message-sample">
      <div><strong>${escapeHtml(sample.name)}</strong><span>${escapeHtml(sample.phone)}</span></div>
      <p>${escapeHtml(sample.message).replaceAll('\n', '<br>')}</p>
    </article>
  `).join('');
  simulationPanel.hidden = false;
  saveDraft.hidden = false;
}

async function loadLists() {
  const { items } = await request('/api/contact-lists');
  contactList.innerHTML = '<option value="">Selecione uma lista</option>' + items.map((item) =>
    `<option value="${item.id}">${escapeHtml(item.name)} (${item.contactCount})</option>`
  ).join('');
}

async function loadDrafts() {
  const { items } = await request('/api/campaigns');
  drafts.innerHTML = items.length === 0 ? '<p>Nenhum rascunho salvo.</p>' : items.map((item) => `
    <article class="saved-list">
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.contactListName)} — ${item.recipientCount} destinatários</span></div>
      <b>Rascunho</b>
    </article>
  `).join('');
}

form.addEventListener('input', () => {
  messageCounter.textContent = `${messageTemplate.value.length} / 4096`;
  if (lastSimulationInput && JSON.stringify(readInput()) !== JSON.stringify(lastSimulationInput)) {
    simulationPanel.hidden = true;
    saveDraft.hidden = true;
    lastSimulationInput = undefined;
  }
});

insertName.addEventListener('click', () => {
  const token = '{{nome}}';
  const start = messageTemplate.selectionStart;
  const end = messageTemplate.selectionEnd;
  messageTemplate.setRangeText(token, start, end, 'end');
  messageTemplate.dispatchEvent(new Event('input', { bubbles: true }));
  messageTemplate.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const input = readInput();
    const simulation = await request('/api/campaigns/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    lastSimulationInput = input;
    renderSimulation(simulation);
  } catch (error) { showError(error.message); }
  finally { submit.disabled = false; }
});

saveDraft.addEventListener('click', async () => {
  showError();
  saveDraft.disabled = true;
  try {
    await request('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastSimulationInput),
    });
    await loadDrafts();
    saveDraft.hidden = true;
  } catch (error) { showError(error.message); }
  finally { saveDraft.disabled = false; }
});

Promise.all([loadLists(), loadDrafts()]).catch((error) => showError(error.message));
