import { homedir } from 'node:os';
import { join } from 'node:path';

export function getConfigDirectory(env = process.env, platform = process.platform): string {
  if (env.WA_DELIVERY_CONFIG_DIR) return env.WA_DELIVERY_CONFIG_DIR;

  if (platform === 'win32') {
    return join(env.APPDATA ?? env.LOCALAPPDATA ?? homedir(), 'WA-Delivery');
  }

  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'WA-Delivery');
  }

  return join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'wa-delivery');
}
