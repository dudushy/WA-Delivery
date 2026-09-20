const params = new URLSearchParams(location.search);
const listId = Number(params.get('id'));
const pageTitle = document.querySelector('#page-title');
const metadata = document.querySelector('#list-metadata');
const pageError = document.querySelector('#page-error');
const renameForm = document.querySelector('#rename-form');
const listName = document.querySelector('#list-name');
const addForm = document.querySelector('#add-contact-form');
const newName = document.querySelector('#new-contact-name');
const newPhone = document.querySelector('#new-contact-phone');
const contactCount = document.querySelector('#contact-count');
const contactRows = document.querySelector('#contact-list-rows');
const deleteListButton = document.querySelector('#delete-list');
let currentList;

function showError(message = '') {
  pageError.hidden = !message;
  pageError.textContent = message;
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value);
  return node.innerHTML;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 204) return undefined;
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.issues?.map((issue) => issue.message).join(' ') || body.message || 'Falha na solicitação.');
  }
  return body;
}

function render(list) {
  currentList = list;
  pageTitle.textContent = list.name;
  listName.value = list.name;
  metadata.textContent = `${list.source === 'manual' ? 'Lista manual' : 'Importada por CSV'} — criada em ${new Date(`${list.createdAt}Z`).toLocaleString('pt-BR')}`;
  contactCount.textContent = `${list.contactCount} contato${list.contactCount === 1 ? '' : 's'}`;
  contactRows.innerHTML = list.contacts.length === 0
    ? '<p>Esta lista ainda não possui contatos.</p>'
    : list.contacts.map((contact) => `
      <form class="contact-row persisted-row${contact.optedOut ? ' opted-out' : ''}" data-member-id="${contact.id}">
        <label>Nome<input class="member-name" value="${escapeAttribute(contact.name)}" required /></label>
        <label>Telefone<input class="member-phone" value="${escapeAttribute(contact.phone)}" inputmode="tel" required /></label>
        <div class="row-actions">
          <button type="submit">Salvar</button>
          <button class="danger remove-member" type="button">Remover</button>
          <label class="opt-out-toggle" title="Contatos com opt-out não recebem campanhas">
            <input class="member-opt-out" type="checkbox" ${contact.optedOut ? 'checked' : ''} />
            Opt-out
          </label>
        </div>
      </form>
    `).join('');

  for (const row of contactRows.querySelectorAll('.persisted-row')) {
    row.addEventListener('submit', (event) => updateMember(event, row));
    row.querySelector('.remove-member').addEventListener('click', () => removeMember(row));
    row.querySelector('.member-opt-out').addEventListener('change', (event) =>
      setOptOut(row, event.target.checked),
    );
  }
}

async function load() {
  if (!Number.isSafeInteger(listId) || listId <= 0) throw new Error('Lista inválida.');
  render(await request(`/api/contact-lists/${listId}`));
}

renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
  try {
    render(await request(`/api/contact-lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: listName.value }),
    }));
  } catch (error) { showError(error.message); }
});

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
  try {
    render(await request(`/api/contact-lists/${listId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.value, phone: newPhone.value }),
    }));
    addForm.reset();
  } catch (error) { showError(error.message); }
});

async function updateMember(event, row) {
  event.preventDefault();
  showError();
  try {
    render(await request(`/api/contact-lists/${listId}/contacts/${row.dataset.memberId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: row.querySelector('.member-name').value,
        phone: row.querySelector('.member-phone').value,
      }),
    }));
  } catch (error) { showError(error.message); }
}

async function setOptOut(row, optedOut) {
  showError();
  try {
    render(await request(`/api/contact-lists/${listId}/contacts/${row.dataset.memberId}/opt-out`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optedOut }),
    }));
  } catch (error) { showError(error.message); }
}

async function removeMember(row) {
  const name = row.querySelector('.member-name').value;
  if (!confirm(`Remover ${name} desta lista?`)) return;
  showError();
  try {
    render(await request(`/api/contact-lists/${listId}/contacts/${row.dataset.memberId}`, {
      method: 'DELETE',
    }));
  } catch (error) { showError(error.message); }
}

deleteListButton.addEventListener('click', async () => {
  if (!confirm(`Excluir definitivamente a lista “${currentList.name}”?`)) return;
  showError();
  try {
    await request(`/api/contact-lists/${listId}`, { method: 'DELETE' });
    location.href = '/contacts.html';
  } catch (error) { showError(error.message); }
});

load().catch((error) => showError(error.message));
