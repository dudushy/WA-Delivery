const title = document.querySelector('#campaign-title');
const statusText = document.querySelector('#campaign-status');
const details = document.querySelector('#campaign-details');
const form = document.querySelector('#campaign-form');
const campaignName = document.querySelector('#campaign-name');
const contactList = document.querySelector('#campaign-list');
const messageTemplate = document.querySelector('#message-template');
const messageCounter = document.querySelector('#message-counter');
const delayMin = document.querySelector('#delay-min');
const delayMax = document.querySelector('#delay-max');
const insertName = document.querySelector('#insert-name');
const mediaInput = document.querySelector('#campaign-media-input');
const mediaPanel = document.querySelector('#campaign-media');
const mediaContent = document.querySelector('#campaign-media-content');
const removeMedia = document.querySelector('#remove-media');
const saveButton = document.querySelector('#save-campaign');
const deleteButton = document.querySelector('#delete-campaign');
const dangerZone = document.querySelector('.danger-zone');
const prepareZone = document.querySelector('#prepare-zone');
const prepareConfirmation = document.querySelector('#prepare-confirmation');
const prepareButton = document.querySelector('#prepare-campaign');
const recipientReview = document.querySelector('#recipient-review');
const recipientSummary = document.querySelector('#recipient-summary');
const recipientList = document.querySelector('#recipient-list');
const executionZone = document.querySelector('#execution-zone');
const executionMetrics = document.querySelector('#execution-metrics');
const startConfirmationLabel = document.querySelector('#start-confirmation-label');
const startConfirmation = document.querySelector('#start-confirmation');
const startCampaign = document.querySelector('#start-campaign');
const pauseCampaign = document.querySelector('#pause-campaign');
const resumeCampaign = document.querySelector('#resume-campaign');
const cancelCampaign = document.querySelector('#cancel-campaign');
const errorPanel = document.querySelector('#campaign-error');
const campaignId = Number(new URLSearchParams(location.search).get('id'));
let selectedMedia;

function showError(text = '') {
  errorPanel.hidden = !text;
  errorPanel.textContent = text;
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    throw new Error(body?.issues?.map((issue) => issue.message).join(' ') || body?.message || 'Falha na solicitação.');
  }
  return body;
}

function renderMedia() {
  mediaPanel.hidden = !selectedMedia;
  if (!selectedMedia) {
    mediaContent.replaceChildren();
    return;
  }
  const preview = document.createElement(selectedMedia.kind === 'video' ? 'video' : 'img');
  preview.src = `/api/media/${selectedMedia.id}`;
  preview.alt = selectedMedia.originalName;
  if (selectedMedia.kind === 'video') preview.controls = true;
  const caption = document.createElement('span');
  caption.textContent = `${selectedMedia.originalName} (${(selectedMedia.sizeBytes / 1024 / 1024).toFixed(2)} MB)`;
  mediaContent.replaceChildren(preview, caption);
}

function renderRecipients(recipients) {
  recipientSummary.textContent = `${recipients.length} destinatário(s) congelado(s) neste snapshot.`;
  recipientList.replaceChildren();
  for (const recipient of recipients.slice(0, 10)) {
    const article = document.createElement('article');
    article.className = 'message-sample';
    const heading = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = recipient.name;
    const phone = document.createElement('span');
    phone.textContent = recipient.phone;
    heading.append(name, phone);
    const renderedMessage = document.createElement('p');
    renderedMessage.textContent = recipient.renderedMessage;
    article.append(heading, renderedMessage);
    recipientList.append(article);
  }
  if (recipients.length > 10) {
    const remainder = document.createElement('p');
    remainder.textContent = `Mais ${recipients.length - 10} destinatário(s) fazem parte do snapshot.`;
    recipientList.append(remainder);
  }
  recipientReview.hidden = false;
}

function applyLockedState(campaign, recipients) {
  for (const control of form.elements) control.disabled = true;
  form.querySelector('.actions').hidden = true;
  prepareZone.hidden = true;
  dangerZone.hidden = true;
  renderRecipients(recipients);
  executionZone.hidden = false;
}

function renderProgress(progress) {
  const labels = { ready: 'preparada', running: 'em execução', paused: 'pausada', completed: 'concluída', cancelled: 'cancelada', failed: 'com falha' };
  statusText.textContent = `Status: ${labels[progress.status] || progress.status}.`;
  executionMetrics.replaceChildren();
  for (const [label, value] of [
    ['Total', progress.total], ['Pendentes', progress.pending], ['Enviados', progress.sent],
    ['Falhas', progress.failed], ['Ignorados', progress.skipped],
  ]) {
    const metric = document.createElement('div');
    metric.className = 'metric';
    const caption = document.createElement('span');
    caption.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    metric.append(caption, strong);
    executionMetrics.append(metric);
  }
  const ready = progress.status === 'ready';
  startConfirmationLabel.hidden = !ready;
  startCampaign.hidden = !ready;
  pauseCampaign.hidden = progress.status !== 'running';
  resumeCampaign.hidden = progress.status !== 'paused';
  cancelCampaign.hidden = !['ready', 'running', 'paused'].includes(progress.status);
}

async function load() {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) throw new Error('Identificador da campanha inválido.');
  const [{ items: lists }, campaign] = await Promise.all([
    request('/api/contact-lists'),
    request(`/api/campaigns/${campaignId}`),
  ]);
  contactList.innerHTML = '<option value="">Selecione uma lista</option>';
  for (const list of lists) {
    const option = document.createElement('option');
    option.value = String(list.id);
    option.textContent = `${list.name} (${list.contactCount})`;
    contactList.append(option);
  }
  title.textContent = campaign.name;
  campaignName.value = campaign.name;
  contactList.value = String(campaign.contactListId);
  messageTemplate.value = campaign.messageTemplate;
  messageCounter.textContent = `${campaign.messageTemplate.length} / 4096`;
  delayMin.value = String(campaign.delayMinSeconds);
  delayMax.value = String(campaign.delayMaxSeconds);
  selectedMedia = campaign.media;
  renderMedia();
  details.hidden = false;
  if (campaign.status !== 'draft') {
    const [{ items }, progress] = await Promise.all([
      request(`/api/campaigns/${campaignId}/recipients`),
      request(`/api/campaigns/${campaignId}/progress`),
    ]);
    applyLockedState(campaign, items);
    renderProgress(progress);
  } else {
    statusText.textContent = 'Status: rascunho editável.';
  }
}

messageTemplate.addEventListener('input', () => {
  messageCounter.textContent = `${messageTemplate.value.length} / 4096`;
});

insertName.addEventListener('click', () => {
  messageTemplate.setRangeText('{{nome}}', messageTemplate.selectionStart, messageTemplate.selectionEnd, 'end');
  messageTemplate.dispatchEvent(new Event('input'));
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
    selectedMedia = await request('/api/media', { method: 'POST', body });
    renderMedia();
  } catch (error) {
    mediaInput.value = '';
    showError(error.message);
  } finally {
    mediaInput.disabled = false;
  }
});

removeMedia.addEventListener('click', () => {
  selectedMedia = undefined;
  mediaInput.value = '';
  renderMedia();
});

prepareConfirmation.addEventListener('change', () => {
  prepareButton.disabled = !prepareConfirmation.checked;
});

prepareButton.addEventListener('click', async () => {
  showError();
  prepareButton.disabled = true;
  try {
    const prepared = await request(`/api/campaigns/${campaignId}/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: prepareConfirmation.checked }),
    });
    applyLockedState(prepared.campaign, prepared.recipients);
    renderProgress(await request(`/api/campaigns/${campaignId}/progress`));
  } catch (error) {
    showError(error.message);
    prepareButton.disabled = !prepareConfirmation.checked;
  }
});

startConfirmation.addEventListener('change', () => {
  startCampaign.disabled = !startConfirmation.checked;
});

async function queueAction(action, body) {
  showError();
  try {
    const progress = await request(`/api/campaigns/${campaignId}/${action}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    renderProgress(progress);
  } catch (error) { showError(error.message); }
}

startCampaign.addEventListener('click', () => queueAction('start', { confirmed: startConfirmation.checked }));
pauseCampaign.addEventListener('click', () => queueAction('pause'));
resumeCampaign.addEventListener('click', () => queueAction('resume'));
cancelCampaign.addEventListener('click', () => {
  if (confirm('Cancelar esta campanha? Os destinatários pendentes não serão enviados.')) {
    void queueAction('cancel');
  }
});

const events = new EventSource('/api/events');
events.addEventListener('campaign-progress', (event) => {
  const progress = JSON.parse(event.data);
  if (progress.campaignId === campaignId) renderProgress(progress);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
  saveButton.disabled = true;
  try {
    const updated = await request(`/api/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: campaignName.value,
        contactListId: Number(contactList.value),
        messageTemplate: messageTemplate.value,
        delayMinSeconds: Number(delayMin.value),
        delayMaxSeconds: Number(delayMax.value),
        mediaId: selectedMedia?.id ?? null,
      }),
    });
    selectedMedia = updated.media;
    title.textContent = updated.name;
    renderMedia();
    mediaInput.value = '';
    saveButton.textContent = 'Alterações salvas';
    setTimeout(() => { saveButton.textContent = 'Salvar alterações'; }, 1800);
  } catch (error) {
    showError(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

deleteButton.addEventListener('click', async () => {
  if (!confirm('Excluir este rascunho?')) return;
  deleteButton.disabled = true;
  try {
    await request(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
    location.href = '/campaigns.html';
  } catch (error) {
    showError(error.message);
    deleteButton.disabled = false;
  }
});

load().catch((error) => showError(error.message));
