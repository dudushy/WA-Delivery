export interface NormalizePhoneOptions {
  defaultCountryCode?: string;
  /** DDD padrão prefixado a números locais curtos (sem DDD), quando informado. */
  defaultAreaCode?: string;
  localNumberLengths?: readonly number[];
}

export function normalizePhone(rawPhone: string, options: NormalizePhoneOptions = {}): string {
  const defaultCountryCode = options.defaultCountryCode ?? '55';
  const defaultAreaCode = options.defaultAreaCode ?? '';
  const localNumberLengths = options.localNumberLengths ?? [10, 11];
  // Comprimentos de assinante local (sem DDD): fixo (8) e celular (9).
  const subscriberLengths = [8, 9];
  const hasExplicitCountryCode = rawPhone.trim().startsWith('+');
  let digits = rawPhone.replace(/\D/g, '');

  if (digits.startsWith('00')) digits = digits.slice(2);

  // Aplica o DDD padrão a números locais sem DDD (ex.: 999999999 -> 16999999999).
  if (!hasExplicitCountryCode && defaultAreaCode && subscriberLengths.includes(digits.length)) {
    digits = `${defaultAreaCode}${digits}`;
  }

  if (!hasExplicitCountryCode && localNumberLengths.includes(digits.length)) {
    digits = `${defaultCountryCode}${digits}`;
  }

  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error('Telefone deve conter entre 8 e 15 dígitos.');
  }

  return digits;
}

export function toWhatsAppJid(phone: string): string {
  return `${normalizePhone(phone)}@s.whatsapp.net`;
}
