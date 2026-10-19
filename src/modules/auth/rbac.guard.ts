import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole, Permission, ROLE_PERMISSIONS } from './rbac.types.js';

/**
 * Fastify preHandler hook to verify JWT authentication token
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (_err: unknown) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required: missing, invalid, or expired bearer token',
      },
    });
  }
}

/**
 * Fastify preHandler hook to enforce required role(s)
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required before role verification',
        },
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]. Current role: ${request.user.role}`,
        },
      });
    }
  };
}

/**
 * Fastify preHandler hook to enforce required permission(s)
 */
export function requirePermissions(...requiredPermissions: Permission[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required before permission verification',
        },
      });
    }

    const userPermissions = ROLE_PERMISSIONS[request.user.role] || [];
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Missing required permissions: [${requiredPermissions.join(', ')}]`,
        },
      });
    }
  };
}
