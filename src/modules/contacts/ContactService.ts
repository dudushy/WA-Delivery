import { normalizePhone, type NormalizePhoneOptions } from './phone.js';
import { ContactRepository } from './ContactRepository.js';
import type { SettingsService } from '../settings/SettingsService.js';
import {
  ContactValidationError,
  type ContactListDetails,
  type ContactListSummary,
  type CreateManualContactListInput,
  type ValidationIssue,
} from './contactTypes.js';

export class ContactService {
  public constructor(
    private readonly repository: ContactRepository,
    private readonly settings?: SettingsService,
  ) {}

  /** Opções de normalização derivadas das configurações persistentes (país/DDD). */
  public normalizeOptions(): NormalizePhoneOptions {
    const current = this.settings?.getAll();
    return {
      defaultCountryCode: current?.defaultCountryCode || '55',
      defaultAreaCode: current?.defaultAreaCode || '',
    };
  }

  public createManualList(input: CreateManualContactListInput): ContactListDetails {
    return this.createList(input, 'manual');
  }

  public createImportedList(input: CreateManualContactListInput): ContactListDetails {
    return this.createList(input, 'csv');
  }

  private createList(
    input: CreateManualContactListInput,
    source: 'manual' | 'csv',
  ): ContactListDetails {
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
        normalizedPhone = normalizePhone(rawPhone, this.normalizeOptions());
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
    return this.repository.createList(listName, source, prepared);
  }

  public list(): ContactListSummary[] {
    return this.repository.list();
  }

  public findById(id: number): ContactListDetails | undefined {
    return this.repository.findById(id);
  }

  public renameList(id: number, rawName: string): ContactListDetails | undefined {
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) {
      throw new ContactValidationError([{ path: 'name', message: 'Informe o nome da lista.' }]);
    }
    return this.repository.renameList(id, name);
  }

  public deleteList(id: number): boolean {
    return this.repository.deleteList(id);
  }

  public addContact(id: number, contact: { name: string; phone: string }): ContactListDetails | undefined {
    return this.repository.addMember(id, this.prepareContact(contact));
  }

  public updateContact(
    listId: number,
    memberId: number,
    contact: { name: string; phone: string },
  ): ContactListDetails | undefined {
    return this.repository.updateMember(listId, memberId, this.prepareContact(contact));
  }

  public deleteContact(listId: number, memberId: number): ContactListDetails | undefined {
    return this.repository.deleteMember(listId, memberId);
  }

  /** Marca/desmarca um contato como opt-out (global por telefone). */
  public setOptOut(
    listId: number,
    memberId: number,
    optedOut: boolean,
  ): ContactListDetails | undefined {
    return this.repository.setOptOutByMember(listId, memberId, optedOut);
  }

  /** Conjunto de telefones marcados como opt-out (para bloqueio em campanhas). */
  public optedOutPhones(): Set<string> {
    return this.repository.listOptedOutPhones();
  }

  private prepareContact(contact: { name: string; phone: string }): {
    name: string;
    normalizedPhone: string;
  } {
    const name = typeof contact?.name === 'string' ? contact.name.trim() : '';
    const issues: ValidationIssue[] = [];
    if (!name) issues.push({ path: 'name', message: 'Informe o nome.' });

    let normalizedPhone = '';
    try {
      normalizedPhone = normalizePhone(
        typeof contact?.phone === 'string' ? contact.phone : '',
        this.normalizeOptions(),
      );
    } catch (error) {
      issues.push({
        path: 'phone',
        message: error instanceof Error ? error.message : 'Telefone inválido.',
      });
    }

    if (issues.length > 0) throw new ContactValidationError(issues);
    return { name, normalizedPhone };
  }
}
