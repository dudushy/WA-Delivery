const overlay = document.querySelector('#onboarding');
const openButton = document.querySelector('#open-onboarding');
const doneButton = document.querySelector('#onboarding-done');
const closeButton = document.querySelector('#onboarding-close');

function open() {
  overlay.hidden = false;
  doneButton?.focus();
}

function close() {
  overlay.hidden = true;
  openButton?.focus();
}

// Marca o onboarding como concluído (não reaparece automaticamente). Falhas de
// rede não bloqueiam o usuário: o guia apenas volta a aparecer na próxima vez.
async function complete() {
  close();
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingCompleted: true }),
    });
  } catch {
    // Sem conexão com o backend: ignora; o estado será tentado novamente depois.
  }
}

openButton?.addEventListener('click', open);
doneButton?.addEventListener('click', () => void complete());
closeButton?.addEventListener('click', close);
// Fecha ao clicar fora do diálogo ou com Esc.
overlay?.addEventListener('click', (event) => {
  if (event.target === overlay) close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !overlay.hidden) close();
});

// Exibe automaticamente apenas no primeiro uso (onboardingCompleted === false).
(async () => {
  try {
    const response = await fetch('/api/settings');
    if (!response.ok) return;
    const settings = await response.json();
    if (!settings.onboardingCompleted) open();
  } catch {
    // Sem backend: não força o guia.
  }
})();
