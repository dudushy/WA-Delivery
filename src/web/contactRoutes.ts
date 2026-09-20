import type { FastifyInstance } from 'fastify';
import type { ContactService } from '../modules/contacts/ContactService.js';
import {
  ContactValidationError,
  type CreateManualContactListInput,
} from '../modules/contacts/contactTypes.js';

export function registerContactRoutes(server: FastifyInstance, contacts: ContactService): void {
  server.get('/api/contact-lists', async () => ({ items: contacts.list() }));

  server.get<{ Params: { id: string } }>('/api/contact-lists/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ message: 'Identificador da lista inválido.' });
    }

    const list = contacts.findById(id);
    if (!list) return reply.code(404).send({ message: 'Lista não encontrada.' });
    return list;
  });

  server.post<{ Body: CreateManualContactListInput }>(
    '/api/contact-lists/manual',
    async (request, reply) => {
      try {
        const created = contacts.createManualList(
          request.body ?? ({} as CreateManualContactListInput),
        );
        return reply.code(201).send(created);
      } catch (error) {
        if (error instanceof ContactValidationError) {
          return reply.code(422).send({ message: error.message, issues: error.issues });
        }
        throw error;
      }
    },
  );

  server.patch<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/contact-lists/:id',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (!id) return reply.code(400).send({ message: 'Identificador da lista inválido.' });
      try {
        const updated = contacts.renameList(id, request.body?.name ?? '');
        return updated ?? reply.code(404).send({ message: 'Lista não encontrada.' });
      } catch (error) {
        return sendContactError(reply, error);
      }
    },
  );

  server.delete<{ Params: { id: string } }>('/api/contact-lists/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return reply.code(400).send({ message: 'Identificador da lista inválido.' });
    if (!contacts.deleteList(id)) return reply.code(404).send({ message: 'Lista não encontrada.' });
    return reply.code(204).send();
  });

  server.post<{
    Params: { id: string };
    Body: { name?: string; phone?: string };
  }>('/api/contact-lists/:id/contacts', async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return reply.code(400).send({ message: 'Identificador da lista inválido.' });
    try {
      const updated = contacts.addContact(id, {
        name: request.body?.name ?? '',
        phone: request.body?.phone ?? '',
      });
      return updated
        ? reply.code(201).send(updated)
        : reply.code(404).send({ message: 'Lista não encontrada.' });
    } catch (error) {
      return sendContactError(reply, error);
    }
  });

  server.put<{
    Params: { id: string; memberId: string };
    Body: { name?: string; phone?: string };
  }>('/api/contact-lists/:id/contacts/:memberId', async (request, reply) => {
    const id = parseId(request.params.id);
    const memberId = parseId(request.params.memberId);
    if (!id || !memberId) {
      return reply.code(400).send({ message: 'Identificador inválido.' });
    }
    try {
      const updated = contacts.updateContact(id, memberId, {
        name: request.body?.name ?? '',
        phone: request.body?.phone ?? '',
      });
      return updated ?? reply.code(404).send({ message: 'Contato não encontrado.' });
    } catch (error) {
      return sendContactError(reply, error);
    }
  });

  server.delete<{ Params: { id: string; memberId: string } }>(
    '/api/contact-lists/:id/contacts/:memberId',
    async (request, reply) => {
      const id = parseId(request.params.id);
      const memberId = parseId(request.params.memberId);
      if (!id || !memberId) return reply.code(400).send({ message: 'Identificador inválido.' });
      const updated = contacts.deleteContact(id, memberId);
      return updated ?? reply.code(404).send({ message: 'Contato não encontrado.' });
    },
  );

  server.put<{
    Params: { id: string; memberId: string };
    Body: { optedOut?: boolean };
  }>('/api/contact-lists/:id/contacts/:memberId/opt-out', async (request, reply) => {
    const id = parseId(request.params.id);
    const memberId = parseId(request.params.memberId);
    if (!id || !memberId) return reply.code(400).send({ message: 'Identificador inválido.' });
    const updated = contacts.setOptOut(id, memberId, Boolean(request.body?.optedOut));
    return updated ?? reply.code(404).send({ message: 'Contato não encontrado.' });
  });
}

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function sendContactError(reply: import('fastify').FastifyReply, error: unknown) {
  if (error instanceof ContactValidationError) {
    return reply.code(422).send({ message: error.message, issues: error.issues });
  }
  const message = error instanceof Error ? error.message : 'Falha ao alterar contato.';
  return reply.code(409).send({ message });
}
