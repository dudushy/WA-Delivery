const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error ?? `Erro HTTP ${response.status}`);
  return body;
}

function showMessage(element, text, error = false) {
  element.textContent = text;
  element.hidden = false;
  element.classList.toggle('error', error);
}

async function loadSettings() {
  const settings = await api('/api/settings');
  $('#phoneNumberId').value = settings.phoneNumberId;
  $('#wabaId').value = settings.wabaId;
  $('#apiVersion').value = settings.apiVersion;
  const status = $('#tokenStatus');
  status.textContent = settings.hasAccessToken ? 'Token protegido' : 'Token não configurado';
  status.classList.toggle('ok', settings.hasAccessToken);
}

function openTab(tabId) {
  document.querySelectorAll('.tab,.panel').forEach((element) => element.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add('active');
  $(`#${tabId}`)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => openTab(button.dataset.tab)));
document.querySelectorAll('[data-open-tab]').forEach((button) => button.addEventListener('click', () => openTab(button.dataset.openTab)));

$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({
      phoneNumberId: $('#phoneNumberId').value,
      wabaId: $('#wabaId').value,
      apiVersion: $('#apiVersion').value,
      accessToken: $('#accessToken').value,
    }) });
    $('#accessToken').value = '';
    await loadSettings();
    showMessage($('#settingsMessage'), 'Configuração salva neste computador.');
  } catch (error) { showMessage($('#settingsMessage'), error.message, true); }
});

$('#testConnection').addEventListener('click', async () => {
  try {
    const result = await api('/api/settings/test', { method: 'POST' });
    showMessage($('#settingsMessage'), `Conexão válida: ${result.verifiedName ?? 'conta sem nome verificado'} (${result.displayPhoneNumber ?? 'número não informado'}).`);
  } catch (error) { showMessage($('#settingsMessage'), error.message, true); }
});

$('#removeToken').addEventListener('click', async () => {
  if (!confirm('Remover o token da Meta do cofre de credenciais deste computador?')) return;
  try {
    await api('/api/settings/access-token', { method: 'DELETE' });
    await loadSettings();
    showMessage($('#settingsMessage'), 'Token removido.');
  } catch (error) { showMessage($('#settingsMessage'), error.message, true); }
});

$('#estimateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/api/pricing/estimate', { method: 'POST', body: JSON.stringify({
      recipients: Number($('#recipients').value), category: $('#category').value, market: 'BR',
    }) });
    $('#estimatedTotal').textContent = money.format(result.estimatedTotal);
    $('#unitPrice').textContent = money.format(result.unitPrice);
    $('#estimateDisclaimer').textContent = `${result.disclaimer} Tabela vigente desde ${new Date(`${result.effectiveFrom}T12:00:00`).toLocaleDateString('pt-BR')}.`;
    $('#pricingSource').href = result.sourceUrl;
    $('#estimateResult').hidden = false;
    $('#estimateMessage').hidden = true;
  } catch (error) { showMessage($('#estimateMessage'), error.message, true); }
});

loadSettings().catch((error) => showMessage($('#settingsMessage'), error.message, true));
