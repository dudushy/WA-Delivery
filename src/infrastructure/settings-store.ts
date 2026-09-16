import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PublicSettings, StoredSettings } from '../domain/settings.js';
import { getConfigDirectory } from './app-paths.js';
import type { SecretStore } from './secret-store.js';

const DEFAULT_API_VERSION = 'v26.0';

export class SettingsStore {
  private readonly directory: string;
  private readonly file: string;

  constructor(private readonly secrets: SecretStore, directory = getConfigDirectory()) {
    this.directory = directory;
    this.file = join(directory, 'config.json');
  }

  private async readStored(): Promise<StoredSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<StoredSettings>;
      return {
        phoneNumberId: parsed.phoneNumberId ?? process.env.META_PHONE_NUMBER_ID ?? '',
        wabaId: parsed.wabaId ?? process.env.META_WABA_ID ?? '',
        apiVersion: parsed.apiVersion ?? process.env.META_API_VERSION ?? DEFAULT_API_VERSION,
        updatedAt: parsed.updatedAt ?? '',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return {
        phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? '',
        wabaId: process.env.META_WABA_ID ?? '',
        apiVersion: process.env.META_API_VERSION ?? DEFAULT_API_VERSION,
        updatedAt: '',
      };
    }
  }

  async getPublic(): Promise<PublicSettings> {
    const stored = await this.readStored();
    return { ...stored, hasAccessToken: Boolean(await this.getAccessToken()) };
  }

  async getRuntime(): Promise<StoredSettings & { accessToken: string }> {
    const stored = await this.readStored();
    const accessToken = await this.getAccessToken();
    if (!accessToken) throw new Error('Token de acesso da Meta não configurado.');
    return { ...stored, accessToken };
  }

  async save(input: Omit<StoredSettings, 'updatedAt'>, accessToken?: string): Promise<PublicSettings> {
    if (accessToken) await this.secrets.set(accessToken);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stored: StoredSettings = { ...input, updatedAt: new Date().toISOString() };
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.file);
    this.applyToProcess(stored, accessToken);
    return { ...stored, hasAccessToken: Boolean(accessToken || await this.getAccessToken()) };
  }

  async deleteAccessToken(): Promise<void> {
    await this.secrets.delete();
    delete process.env.META_ACCESS_TOKEN;
  }

  private async getAccessToken(): Promise<string | null> {
    return process.env.META_ACCESS_TOKEN ?? (await this.secrets.get());
  }

  private applyToProcess(settings: StoredSettings, accessToken?: string): void {
    process.env.META_PHONE_NUMBER_ID = settings.phoneNumberId;
    process.env.META_WABA_ID = settings.wabaId;
    process.env.META_API_VERSION = settings.apiVersion;
    if (accessToken) process.env.META_ACCESS_TOKEN = accessToken;
  }
}
