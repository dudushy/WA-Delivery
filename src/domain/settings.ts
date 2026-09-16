import { z } from 'zod';

export const metaSettingsSchema = z.object({
  phoneNumberId: z.string().trim().min(1, 'Informe o Phone Number ID.'),
  wabaId: z.string().trim().min(1, 'Informe o WhatsApp Business Account ID.'),
  apiVersion: z.string().regex(/^v\d+\.\d+$/, 'Use o formato v26.0.'),
  accessToken: z.string().trim().optional(),
});

export type MetaSettingsInput = z.infer<typeof metaSettingsSchema>;

export interface StoredSettings {
  phoneNumberId: string;
  wabaId: string;
  apiVersion: string;
  updatedAt: string;
}

export interface PublicSettings extends StoredSettings {
  hasAccessToken: boolean;
}
