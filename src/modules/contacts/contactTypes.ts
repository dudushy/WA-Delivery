export interface ManualContactInput {
  name: string;
  phone: string;
  /** Colunas extras (importação CSV) preservadas para variáveis de template. */
  data?: Record<string, string>;
}

export interface CreateManualContactListInput {
  name: string;
  contacts: ManualContactInput[];
}

export interface ContactListSummary {
  id: number;
  name: string;
  source: 'manual' | 'csv';
  contactCount: number;
  createdAt: string;
}

export interface ContactListMember {
  id: number;
  name: string;
  phone: string;
  optedOut: boolean;
  /** Colunas extras importadas do CSV, disponíveis como variáveis de template. */
  data: Record<string, string>;
}

export interface ContactListDetails extends ContactListSummary {
  contacts: ContactListMember[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ContactValidationError extends Error {
  public constructor(public readonly issues: ValidationIssue[]) {
    super('Os dados da lista de contatos são inválidos.');
    this.name = 'ContactValidationError';
  }
}
