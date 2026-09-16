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
    configureBackend();
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

export function configureBackend(env = process.env, platform = process.platform): void {
  if (env.TS_KEYRING_BACKEND) return;

  if (platform === 'win32') {
    env.TS_KEYRING_BACKEND = 'windows';
    return;
  }

  if (platform === 'darwin') {
    env.TS_KEYRING_BACKEND = 'native-macos';
    return;
  }

  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) {
    // WSL normalmente não possui uma sessão D-Bus/Secret Service. O backend
    // file do cross-keychain usa AES-256-GCM e arquivos com permissão 0600.
    env.TS_KEYRING_BACKEND = 'file';
  }
  // Em Linux desktop, deixa o cross-keychain detectar Secret Service e usar
  // seu fallback criptografado caso nenhum cofre nativo esteja disponível.
}
