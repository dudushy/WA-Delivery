const form = document.querySelector('#manual-list-form');
const listName = document.querySelector('#list-name');
const rows = document.querySelector('#contact-rows');
const addButton = document.querySelector('#add-contact');
const errors = document.querySelector('#form-errors');
const savedLists = document.querySelector('#saved-lists');

function addContactRow(contact = { name: '', phone: '' }) {
  const row = document.createElement('div');
  row.className = 'contact-row';
  row.innerHTML = `
    <label>Nome<input class="contact-name" autocomplete="name" required></label>
    <label>Telefone<input class="contact-phone" inputmode="tel" placeholder="(16) 99999-9999" required></label>
    <button class="remove-contact danger" type="button" aria-label="Remover contato">Remover</button>
  `;
  row.querySelector('.contact-name').value = contact.name;
  row.querySelector('.contact-phone').value = contact.phone;
  row.querySelector('.remove-contact').addEventListener('click', () => {
    if (rows.children.length > 1) row.remove();
  });
  rows.append(row);
}

function readContacts() {
  return [...rows.querySelectorAll('.contact-row')].map((row) => ({
    name: row.querySelector('.contact-name').value,
    phone: row.querySelector('.contact-phone').value,
  }));
}

function showErrors(issues) {
  errors.hidden = issues.length === 0;
  errors.innerHTML = issues.map((issue) => `<div>${escapeHtml(issue.message)}</div>`).join('');
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

async function loadLists() {
  const response = await fetch('/api/contact-lists');
  const { items } = await response.json();
  savedLists.innerHTML = items.length === 0
    ? '<p>Nenhuma lista cadastrada.</p>'
    : items.map((item) => `
        <article class="saved-list">
          <div><strong>${escapeHtml(item.name)}</strong><span>${item.source === 'manual' ? 'Manual' : 'CSV'}</span></div>
          <b>${item.contactCount} contato${item.contactCount === 1 ? '' : 's'}</b>
        </article>
      `).join('');
}

addButton.addEventListener('click', () => addContactRow());

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showErrors([]);
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/contact-lists/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: listName.value, contacts: readContacts() }),
    });
    const body = await response.json();
    if (!response.ok) {
      showErrors(body.issues ?? [{ message: body.message ?? 'Não foi possível salvar a lista.' }]);
      return;
    }

    form.reset();
    rows.replaceChildren();
    addContactRow();
    await loadLists();
  } catch (error) {
    showErrors([{ message: `Falha ao comunicar com a aplicação: ${error.message}` }]);
  } finally {
    submitButton.disabled = false;
  }
});

addContactRow();
loadLists().catch((error) => {
  savedLists.innerHTML = `<p class="error">Falha ao carregar listas: ${escapeHtml(error.message)}</p>`;
});
