import type { FastifyInstance } from 'fastify';
import type { ContactService } from '../modules/contacts/ContactService.js';
import {
  ContactValidationError,
  type CreateManualContactListInput,
} from '../modules/contacts/contactTypes.js';

export function registerContactRoutes(
  server: FastifyInstance,
  contacts: ContactService,
): void {
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
        const created = contacts.createManualList(request.body ?? ({} as CreateManualContactListInput));
        return reply.code(201).send(created);
      } catch (error) {
        if (error instanceof ContactValidationError) {
          return reply.code(422).send({ message: error.message, issues: error.issues });
        }
        throw error;
      }
    },
  );
}
