const statusTitle = document.querySelector('#status-title');
const statusDescription = document.querySelector('#status-description');
const statusDot = document.querySelector('#status-dot');
const qrPanel = document.querySelector('#qr-panel');
const qrCode = document.querySelector('#qr-code');
const errorMessage = document.querySelector('#error-message');
const connectButton = document.querySelector('#connect-button');
const disconnectButton = document.querySelector('#disconnect-button');

const labels = {
  disconnected: ['Desconectado', 'Clique para iniciar a conexão.', 'idle'],
  connecting: ['Conectando...', 'Aguarde o WhatsApp responder.', 'pending'],
  qr_pending: ['Escaneie o QR Code', 'Use o WhatsApp no celular para conectar.', 'pending'],
  connected: ['Conectado', 'A sessão está pronta e salva localmente.', 'success'],
  reconnecting: ['Reconectando...', 'A conexão caiu e será restabelecida automaticamente.', 'pending'],
  logged_out: ['Sessão encerrada', 'Conecte novamente para criar uma nova sessão.', 'error'],
  error: ['Erro de conexão', 'Não foi possível conectar ao WhatsApp.', 'error'],
};

function render(state) {
  const [title, description, tone] = labels[state.status] ?? labels.error;
  statusTitle.textContent = title;
  statusDescription.textContent = description;
  statusDot.dataset.tone = tone;

  const hasQrCode = Boolean(state.qrCodeDataUrl);
  qrPanel.hidden = !hasQrCode;
  if (hasQrCode) qrCode.src = state.qrCodeDataUrl;

  errorMessage.hidden = !state.error;
  errorMessage.textContent = state.error ?? '';
  connectButton.hidden = ['connecting', 'qr_pending', 'connected', 'reconnecting'].includes(state.status);
  disconnectButton.hidden = state.status !== 'connected';
}

async function request(method, path) {
  connectButton.disabled = true;
  disconnectButton.disabled = true;
  try {
    const response = await fetch(path, { method });
    if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    render({ status: 'error', error: `Não foi possível comunicar com a aplicação: ${error.message}` });
  } finally {
    connectButton.disabled = false;
    disconnectButton.disabled = false;
  }
}

connectButton.addEventListener('click', () => request('POST', '/api/whatsapp/connect'));
disconnectButton.addEventListener('click', () => request('POST', '/api/whatsapp/disconnect'));

fetch('/api/whatsapp/status').then((response) => response.json()).then(render);

const events = new EventSource('/api/events');
events.addEventListener('whatsapp-state', (event) => render(JSON.parse(event.data)));
events.onerror = () => {
  statusDescription.textContent = 'Atualização em tempo real indisponível. Tentando reconectar...';
};
