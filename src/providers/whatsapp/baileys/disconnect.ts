import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';

export interface DisconnectDecision {
  shouldReconnect: boolean;
  loggedOut: boolean;
  statusCode?: number;
}

export function decideDisconnect(error: unknown): DisconnectDecision {
  const statusCode = error instanceof Boom ? error.output.statusCode : undefined;
  const loggedOut = statusCode === DisconnectReason.loggedOut;

  return {
    shouldReconnect: !loggedOut,
    loggedOut,
    ...(statusCode === undefined ? {} : { statusCode }),
  };
}
