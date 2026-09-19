import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { BaileysWhatsAppProvider } from '../src/providers/whatsapp/baileys/BaileysWhatsAppProvider.js';

describe('BaileysWhatsAppProvider.hasSavedSession', () => {
  const created: string[] = [];

  after(async () => {
    for (const dir of created) await rm(dir, { recursive: true, force: true });
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'wa-session-'));
    created.push(dir);
    return dir;
  }

  it('retorna false quando não há credenciais salvas', async () => {
    const base = await tempDir();
    const provider = new BaileysWhatsAppProvider({ sessionDirectory: join(base, 'baileys') });
    assert.equal(await provider.hasSavedSession(), false);
  });

  it('retorna true quando o arquivo creds.json existe', async () => {
    const base = await tempDir();
    const sessionDirectory = join(base, 'baileys');
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(join(sessionDirectory, 'creds.json'), '{}', 'utf8');
    const provider = new BaileysWhatsAppProvider({ sessionDirectory });
    assert.equal(await provider.hasSavedSession(), true);
  });
});
