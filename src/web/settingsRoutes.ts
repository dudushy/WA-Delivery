import type { FastifyInstance } from 'fastify';
import type { SettingsService } from '../modules/settings/SettingsService.js';
import { SettingsValidationError, type AppSettings } from '../modules/settings/settingsTypes.js';

export function registerSettingsRoutes(server: FastifyInstance, settings: SettingsService): void {
  server.get('/api/settings', async () => settings.getAll());

  server.put<{ Body: Partial<Record<keyof AppSettings, unknown>> }>(
    '/api/settings',
    async (request, reply) => {
      try {
        return settings.update(request.body ?? {});
      } catch (error) {
        if (error instanceof SettingsValidationError) {
          return reply.code(422).send({ message: error.message, issues: error.issues });
        }
        throw error;
      }
    },
  );
}
