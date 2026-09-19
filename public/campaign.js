const title = document.querySelector('#campaign-title');
const details = document.querySelector('#campaign-details');
const metrics = document.querySelector('#campaign-metrics');
const message = document.querySelector('#campaign-message');
const mediaPanel = document.querySelector('#campaign-media');
const mediaContent = document.querySelector('#campaign-media-content');
const deleteButton = document.querySelector('#delete-campaign');
const errorPanel = document.querySelector('#campaign-error');
const campaignId = Number(new URLSearchParams(location.search).get('id'));

function showError(text) {
  errorPanel.hidden = !text;
  errorPanel.textContent = text;
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error(body?.message || 'Falha na solicitação.');
  return body;
}

function render(campaign) {
  title.textContent = campaign.name;
  metrics.innerHTML = '';
  for (const [label, value] of [
    ['Status', 'Rascunho'],
    ['Lista', campaign.contactListName],
    ['Destinatários', campaign.recipientCount],
    ['Intervalo', `${campaign.delayMinSeconds}s a ${campaign.delayMaxSeconds}s`],
  ]) {
    const card = document.createElement('div');
    card.className = 'metric';
    const caption = document.createElement('span');
    caption.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    card.append(caption, strong);
    metrics.append(card);
  }
  message.textContent = campaign.messageTemplate;
  if (campaign.media) {
    const preview = document.createElement(campaign.media.kind === 'video' ? 'video' : 'img');
    preview.src = `/api/media/${campaign.media.id}`;
    preview.alt = campaign.media.originalName;
    if (campaign.media.kind === 'video') preview.controls = true;
    const caption = document.createElement('span');
    caption.textContent = `${campaign.media.originalName} (${(campaign.media.sizeBytes / 1024 / 1024).toFixed(2)} MB)`;
    mediaContent.replaceChildren(preview, caption);
    mediaPanel.hidden = false;
  }
  details.hidden = false;
}

async function load() {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) throw new Error('Identificador da campanha inválido.');
  render(await request(`/api/campaigns/${campaignId}`));
}

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
