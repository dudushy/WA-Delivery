const title = document.querySelector('#campaign-title');
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
