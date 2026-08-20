import type { FastifyRequest } from 'fastify';
import type { AuthService } from '../auth/service.js';
import type { AuthenticatedActor } from '../auth/types.js';

export const authenticateAdminMaster = async (
  request: FastifyRequest,
  authService: AuthService,
): Promise<AuthenticatedActor | null> => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const actor = await authService.authenticate(header.slice('Bearer '.length).trim());
    return actor.user.role === 'admin_master' ? actor : null;
  } catch {
    return null;
  }
};
