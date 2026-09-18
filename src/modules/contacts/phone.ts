export interface NormalizePhoneOptions {
  defaultCountryCode?: string;
  localNumberLengths?: readonly number[];
}

export function normalizePhone(
  rawPhone: string,
  options: NormalizePhoneOptions = {},
): string {
  const defaultCountryCode = options.defaultCountryCode ?? '55';
  const localNumberLengths = options.localNumberLengths ?? [10, 11];
  const hasExplicitCountryCode = rawPhone.trim().startsWith('+');
  let digits = rawPhone.replace(/\D/g, '');

  if (digits.startsWith('00')) digits = digits.slice(2);

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
