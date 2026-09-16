import { deletePassword, getPassword, setPassword } from 'cross-keychain';

const SERVICE = 'WA-Delivery';
const ACCOUNT = 'meta-access-token';

export interface SecretStore {
  get(): Promise<string | null>;
  set(secret: string): Promise<void>;
  delete(): Promise<void>;
}

export class SystemSecretStore implements SecretStore {
  constructor() {
    // Impede fallback silencioso para arquivo em texto puro.
    process.env.TS_KEYRING_BACKEND ??= process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
        ? 'native-macos'
        : 'secret-service';
  }

  get(): Promise<string | null> {
    return getPassword(SERVICE, ACCOUNT);
  }

  async set(secret: string): Promise<void> {
    await setPassword(SERVICE, ACCOUNT, secret);
  }

  async delete(): Promise<void> {
    await deletePassword(SERVICE, ACCOUNT);
  }
}
