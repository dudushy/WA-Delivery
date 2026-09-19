import { normalizePhone } from './phone.js';
import { ContactRepository } from './ContactRepository.js';
import {
  ContactValidationError,
  type ContactListDetails,
  type ContactListSummary,
  type CreateManualContactListInput,
  type ValidationIssue,
} from './contactTypes.js';

export class ContactService {
  public constructor(private readonly repository: ContactRepository) {}

  public createManualList(input: CreateManualContactListInput): ContactListDetails {
    const listName = typeof input.name === 'string' ? input.name.trim() : '';
    const contacts = Array.isArray(input.contacts) ? input.contacts : [];
    const issues: ValidationIssue[] = [];

    if (!listName) issues.push({ path: 'name', message: 'Informe o nome da lista.' });
    if (contacts.length === 0) {
      issues.push({ path: 'contacts', message: 'Adicione pelo menos um contato.' });
    }

    const seenPhones = new Map<string, number>();
    const prepared = contacts.map((contact, index) => {
      const name = typeof contact?.name === 'string' ? contact.name.trim() : '';
      const rawPhone = typeof contact?.phone === 'string' ? contact.phone : '';
      if (!name) {
        issues.push({ path: `contacts.${index}.name`, message: 'Informe o nome.' });
      }

      let normalizedPhone = '';
      try {
        normalizedPhone = normalizePhone(rawPhone);
        const firstIndex = seenPhones.get(normalizedPhone);
        if (firstIndex !== undefined) {
          issues.push({
            path: `contacts.${index}.phone`,
            message: `Número duplicado; já informado no contato ${firstIndex + 1}.`,
          });
        } else {
          seenPhones.set(normalizedPhone, index);
        }
      } catch (error) {
        issues.push({
          path: `contacts.${index}.phone`,
          message: error instanceof Error ? error.message : 'Telefone inválido.',
        });
      }

      return { name, normalizedPhone };
    });

    if (issues.length > 0) throw new ContactValidationError(issues);
    return this.repository.createManualList(listName, prepared);
  }

  public list(): ContactListSummary[] {
    return this.repository.list();
  }

  public findById(id: number): ContactListDetails | undefined {
    return this.repository.findById(id);
  }
}
