import { canAccess, type AdminAccess, type AdminArea, type StaffRole } from '@optical/shared/admin';
import type { FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';

export interface Actor {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  requestId: string;
}

/**
 * The signed-in staff member, if their role allows this area. The role is
 * read from the database on every admin request, so a demotion takes
 * effect at once rather than when the access token expires.
 */
export async function requireStaff(
  db: Db,
  request: FastifyRequest,
  area: AdminArea,
  access: AdminAccess,
): Promise<Actor> {
  const claims = await request.requireUser();
  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, name: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt || (user.role !== 'STAFF' && user.role !== 'ADMIN'))
    throw new AppError('FORBIDDEN', 'This page is for the store team.');
  if (!canAccess(user.role, area, access))
    throw new AppError('FORBIDDEN', 'Your role cannot do that. Ask an admin.');
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    requestId: request.id,
  };
}

type Tx = Prisma.TransactionClient;
const json = (value: unknown) =>
  value === undefined || value === null
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

/** Records one admin change: who, what, and the record before and after. */
export async function audit(
  tx: Tx,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorEmail: actor.email,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: json(entry.before),
      after: json(entry.after),
      requestId: actor.requestId,
    },
  });
}
