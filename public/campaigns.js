const form = document.querySelector('#campaign-form');
const campaignName = document.querySelector('#campaign-name');
const contactList = document.querySelector('#campaign-list');
const messageTemplate = document.querySelector('#message-template');
const messageCounter = document.querySelector('#message-counter');
const delayMin = document.querySelector('#delay-min');
const delayMax = document.querySelector('#delay-max');
const insertName = document.querySelector('#insert-name');
const variablesHint = document.querySelector('#variables-hint');
const mediaInput = document.querySelector('#campaign-media');
const mediaPreview = document.querySelector('#media-preview');
const mediaPreviewContent = document.querySelector('#media-preview-content');
const removeMedia = document.querySelector('#remove-media');
const saveDraft = document.querySelector('#save-draft');
const errorPanel = document.querySelector('#campaign-error');
const simulationPanel = document.querySelector('#simulation-panel');
const simulationCards = document.querySelector('#simulation-cards');
const durationSummary = document.querySelector('#duration-summary');
const messageSamples = document.querySelector('#message-samples');
const drafts = document.querySelector('#campaign-drafts');
const composer = document.querySelector('#composer');
const newCampaignButton = document.querySelector('#new-campaign');
const cancelComposerButton = document.querySelector('#cancel-composer');
const listsSection = document.querySelector('.lists-section');
let lastSimulationInput;
let uploadedMedia;
let hasCampaigns = false;

// Exibe o formulário de nova campanha acima da lista, para o usuário não
// precisar rolar toda a lista até chegar ao formulário.
if (composer && listsSection && listsSection.parentNode) {
  listsSection.parentNode.insertBefore(composer, listsSection);
}

function showComposer(show) {
  composer.hidden = !show;
  // O botão "Nova campanha" só faz sentido quando o composer está fechado e já
  // existem campanhas na lista.
  newCampaignButton.hidden = show || !hasCampaigns;
  // "Cancelar" só aparece quando há campanhas para voltar (senão o composer é a
  // única coisa a exibir).
  cancelComposerButton.hidden = !show || !hasCampaigns;
  if (show) {
    composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    campaignName.focus();
  }
}

function resetComposer() {
  form.reset();
  uploadedMedia = undefined;
  lastSimulationInput = undefined;
  renderMediaPreview();
  simulationPanel.hidden = true;
  saveDraft.hidden = true;
  messageCounter.textContent = '0 / 4096';
}

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
    ...(uploadedMedia ? { mediaId: uploadedMedia.id } : {}),
  };
}

function renderMediaPreview() {
  mediaPreview.hidden = !uploadedMedia;
  if (!uploadedMedia) {
    mediaPreviewContent.replaceChildren();
    return;
  }
  const preview = document.createElement(uploadedMedia.kind === 'video' ? 'video' : 'img');
  preview.src = uploadedMedia.previewUrl;
  preview.alt = uploadedMedia.originalName;
  if (uploadedMedia.kind === 'video') preview.controls = true;
  const name = document.createElement('span');
  name.textContent = `${uploadedMedia.originalName} (${(uploadedMedia.sizeBytes / 1024 / 1024).toFixed(2)} MB)`;
  mediaPreviewContent.replaceChildren(preview, name);
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
    ['Opt-outs ignorados', simulation.optedOutCount ?? 0],
    ['Intervalo mínimo', `${simulation.delayMinSeconds}s`],
    ['Intervalo médio', `${(simulation.delayMinSeconds + simulation.delayMaxSeconds) / 2}s`],
    ['Intervalo máximo', `${simulation.delayMaxSeconds}s`],
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
  durationSummary.textContent = `Duração estimada: entre ${formatDuration(simulation.durationMinSeconds)} e ${formatDuration(simulation.durationMaxSeconds)}; média de ${formatDuration(simulation.durationAverageSeconds)}.`;
  messageSamples.innerHTML = simulation.samples.map((sample) => `
    <article class="message-sample">
      <div><strong>${escapeHtml(sample.name)}</strong><span>${escapeHtml(sample.phone)}</span></div>
      <p>${escapeHtml(sample.message)}</p>
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

// Ao selecionar uma lista, mostra as variáveis de template disponíveis
// (sempre {{nome}} + colunas extras importadas do CSV).
async function updateVariablesHint() {
  const id = Number(contactList.value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    variablesHint.hidden = true;
    return;
  }
  try {
    const list = await request(`/api/contact-lists/${id}`);
    const keys = new Set(['nome']);
    for (const contact of list.contacts ?? []) {
      for (const key of Object.keys(contact.data ?? {})) keys.add(key);
    }
    const vars = [...keys].map((key) => `{{${key}}}`).join(', ');
    variablesHint.textContent = `Variáveis disponíveis para esta lista: ${vars}`;
    variablesHint.hidden = false;
  } catch {
    variablesHint.hidden = true;
  }
}

contactList.addEventListener('change', () => void updateVariablesHint());

const CAMPAIGN_STATUS_LABELS = {
  draft: 'Não iniciada',
  ready: 'Pronta para envio',
  running: 'Em execução',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  failed: 'Com falha',
};

async function loadDrafts() {
  const { items } = await request('/api/campaigns');
  hasCampaigns = items.length > 0;
  drafts.innerHTML = items.length === 0 ? '<p>Nenhuma campanha salva ainda.</p>' : items.map((item) => `
    <a class="saved-list" href="/campaign.html?id=${item.id}">
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.contactListName)} — ${item.recipientCount} destinatários</span></div>
      <b>${CAMPAIGN_STATUS_LABELS[item.status] ?? item.status}</b>
    </a>
  `).join('');
  // Sem campanhas: mostra o composer direto. Com campanhas: mostra a lista e o
  // botão "Nova campanha", mantendo o composer fechado (a não ser que já esteja
  // aberto por ação do usuário).
  if (!hasCampaigns) {
    showComposer(true);
  } else if (composer.hidden) {
    showComposer(false);
  } else {
    // Composer já aberto pelo usuário: apenas garante o botão coerente.
    newCampaignButton.hidden = true;
    cancelComposerButton.hidden = false;
  }
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

mediaInput.addEventListener('change', async () => {
  const file = mediaInput.files?.[0];
  if (!file) return;
  showError();
  mediaInput.disabled = true;
  try {
    const body = new FormData();
    body.append('file', file);
    uploadedMedia = await request('/api/media', { method: 'POST', body });
    renderMediaPreview();
    form.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (error) {
    mediaInput.value = '';
    showError(error.message);
  } finally {
    mediaInput.disabled = false;
  }
});

removeMedia.addEventListener('click', () => {
  uploadedMedia = undefined;
  mediaInput.value = '';
  renderMediaPreview();
  form.dispatchEvent(new Event('input', { bubbles: true }));
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
    resetComposer();
    showComposer(false);
    await loadDrafts();
  } catch (error) { showError(error.message); }
  finally { saveDraft.disabled = false; }
});

newCampaignButton.addEventListener('click', () => {
  showError();
  resetComposer();
  showComposer(true);
});

cancelComposerButton.addEventListener('click', () => {
  showError();
  resetComposer();
  showComposer(false);
});

Promise.all([loadLists(), loadDrafts()]).catch((error) => showError(error.message));
