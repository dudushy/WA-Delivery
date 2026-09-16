import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { estimateCost, estimateInputSchema } from './domain/pricing.js';
import { metaSettingsSchema } from './domain/settings.js';
import { SettingsStore } from './infrastructure/settings-store.js';
import { SystemSecretStore } from './infrastructure/secret-store.js';
import { testMetaConnection } from './meta/meta-client.js';

const app = express();
const settings = new SettingsStore(new SystemSecretStore());
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, '..', 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(publicDirectory));

app.get('/api/settings', async (_request, response) => {
  response.json(await settings.getPublic());
});

app.put('/api/settings', async (request, response) => {
  const input = metaSettingsSchema.parse(request.body);
  const saved = await settings.save({
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    apiVersion: input.apiVersion,
  }, input.accessToken || undefined);
  response.json(saved);
});

app.delete('/api/settings/access-token', async (_request, response) => {
  await settings.deleteAccessToken();
  response.status(204).end();
});

app.post('/api/settings/test', async (_request, response) => {
  response.json(await testMetaConnection(await settings.getRuntime()));
});

app.post('/api/pricing/estimate', (request, response) => {
  const input = estimateInputSchema.parse(request.body);
  response.json(estimateCost(input.recipients, input.category));
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: error.issues[0]?.message ?? 'Dados inválidos.' });
    return;
  }
  const message = error instanceof Error ? error.message : 'Erro interno inesperado.';
  console.error(error);
  response.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => {
  console.log(`WA-Delivery disponível em http://${host}:${port}`);
});
