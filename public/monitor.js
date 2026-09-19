import { sounds } from '/sounds.js';

const errorPanel = document.querySelector('#monitor-error');
const emptyPanel = document.querySelector('#monitor-empty');
const activePanel = document.querySelector('#monitor-active');
const nameEl = document.querySelector('#monitor-name');
const statusEl = document.querySelector('#monitor-status');
const openLink = document.querySelector('#monitor-open');
const sourceEl = document.querySelector('#monitor-source');
const metricsEl = document.querySelector('#monitor-metrics');
const barFill = document.querySelector('#monitor-bar-fill');
const percentEl = document.querySelector('#monitor-percent');
const factStart = document.querySelector('#fact-start');
const factElapsed = document.querySelector('#fact-elapsed');
const factRemaining = document.querySelector('#fact-remaining');
const factTotal = document.querySelector('#fact-total');
const factInterval = document.querySelector('#fact-interval');
const factSource = document.querySelector('#fact-source');

const STATUS_LABELS = {
  ready: 'Pronta para envio', running: 'Em execução', paused: 'Pausada',
  completed: 'Concluída', cancelled: 'Cancelada', failed: 'Com falha',
};

let campaign;
let lastStatus;
let elapsedTimer;

function showError(text = '') {
  errorPanel.hidden = !text;
  errorPanel.textContent = text;
}

async function request(path) {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Falha na solicitação.');
  return body;
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h && `${h}h`, m && `${m}min`, `${sec}s`].filter(Boolean).join(' ');
}

function formatDateTime(value) {
  if (!value) return '—';
  // O banco grava em UTC ("YYYY-MM-DD HH:MM:SS"); interpreta como UTC.
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function startedAtMs() {
  if (!campaign?.startedAt) return undefined;
  const date = new Date(`${campaign.startedAt.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function renderProgress(progress) {
  const done = progress.sent + progress.failed + progress.skipped;
  const percent = progress.total > 0 ? Math.round((done / progress.total) * 100) : 0;
  barFill.style.width = `${percent}%`;
  percentEl.textContent = `${percent}%`;

  metricsEl.replaceChildren();
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
    metricsEl.append(metric);
  }
  statusEl.textContent = `Status: ${STATUS_LABELS[progress.status] || progress.status}.`;

  // Estimativa de tempo restante: considera cada pendente (incluindo o envio em
  // andamento) e adiciona uma folga de retentativas proporcional à taxa de
  // falhas transitórias observada, mais o backoff médio configurado.
  if (campaign) {
    const avgInterval = (campaign.delayMinSeconds + campaign.delayMaxSeconds) / 2;
    const processed = progress.sent + progress.failed + progress.skipped;
    // Taxa de falhas observada (limitada a 50%) para estimar retentativas extras.
    const failureRate = processed > 0 ? Math.min(0.5, progress.failed / processed) : 0;
    const pending = progress.pending;
    // Cada pendente incorre em um intervalo; as retentativas adicionam um
    // intervalo extra proporcional à taxa de falhas observada.
    const baseSeconds = pending * avgInterval;
    const retrySeconds = pending * failureRate * avgInterval;
    factRemaining.textContent = progress.status === 'running'
      ? formatDuration(baseSeconds + retrySeconds)
      : '—';
  }
}

function updateElapsed() {
  const startMs = startedAtMs();
  factElapsed.textContent = startMs ? formatDuration((Date.now() - startMs) / 1000) : '—';
}

function renderCampaign(active, progress) {
  campaign = active;
  emptyPanel.hidden = true;
  activePanel.hidden = false;
  nameEl.textContent = active.name;
  openLink.setAttribute('href', `/campaign.html?id=${active.id}`);
  factStart.textContent = formatDateTime(active.startedAt);
  factTotal.textContent = String(progress.total);
  factInterval.textContent = `${active.delayMinSeconds}s – ${active.delayMaxSeconds}s`;
  if (active.sourceCampaignId) {
    sourceEl.hidden = false;
    sourceEl.innerHTML = '';
    const link = document.createElement('a');
    link.href = `/campaign.html?id=${active.sourceCampaignId}`;
    link.textContent = `campanha #${active.sourceCampaignId}`;
    sourceEl.append('Reenvio criado a partir da ', link, '.');
    factSource.replaceChildren(link.cloneNode(true));
  } else {
    sourceEl.hidden = true;
    factSource.textContent = '—';
  }
  renderProgress(progress);
  updateElapsed();
  if (!elapsedTimer) elapsedTimer = setInterval(updateElapsed, 1000);
}

function showEmpty() {
  campaign = undefined;
  activePanel.hidden = true;
  emptyPanel.hidden = false;
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = undefined; }
}

function handleStatusTransition(status, progress) {
  if (status === lastStatus) return;
  // Sons nas transições de estado.
  if (status === 'running' && lastStatus && lastStatus !== 'running') sounds.start();
  if (status === 'completed') sounds.finish();
  if (status === 'failed' || status === 'cancelled') sounds.error();
  lastStatus = status;
}

async function findActive() {
  const { items } = await request('/api/campaigns');
  // Campanha ativa: em execução ou pausada (prioriza a em execução).
  return items.find((c) => c.status === 'running')
    ?? items.find((c) => c.status === 'paused');
}

async function load() {
  try {
    const active = await findActive();
    if (!active) { showEmpty(); return; }
    const progress = await request(`/api/campaigns/${active.id}/progress`);
    lastStatus = progress.status;
    renderCampaign(active, progress);
  } catch (error) {
    showError(error.message);
  }
}

const events = new EventSource('/api/events');
events.addEventListener('campaign-progress', (event) => {
  const progress = JSON.parse(event.data);
  if (!campaign || progress.campaignId !== campaign.id) {
    // Uma nova campanha entrou em execução: recarrega os detalhes.
    void load();
    return;
  }
  handleStatusTransition(progress.status, progress);
  renderProgress(progress);
  if (['completed', 'cancelled', 'failed'].includes(progress.status) && elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = undefined;
  }
});

void load();
