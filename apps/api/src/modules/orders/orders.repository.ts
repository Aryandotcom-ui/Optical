import type { Prisma } from '../../generated/prisma/client';

export const orderInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: { variant: { select: { product: { select: { slug: true } } } } },
  },
  events: { where: { visibleToCustomer: true }, orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  reservations: { where: { releasedAt: null, committedAt: null }, select: { expiresAt: true } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
