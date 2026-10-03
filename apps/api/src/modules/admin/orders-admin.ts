import { canTransition, orderStatuses } from '@optical/shared/orders';
import {
  correctionTemplates,
  type orderRefundSchema,
  type orderTransitionSchema,
  type orderUpdateSchema,
  type AdminListQuery,
  type PrescriptionReview,
} from '@optical/shared/admin';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { queueEmail } from '../../infra/email/outbox';
import type { Db } from '../../infra/prisma';
import type { JobQueue } from '../../infra/queue';
import type { FileLinks } from '../../infra/storage';
import { AppError } from '../../lib/app-error';
import { transition, type Tx } from '../orders/lifecycle';
import { orderUrl } from '../orders/order-email';
import { providerCode } from '../orders/orders.mapper';
import type { PaymentGateway } from '../payments/payment-gateway';
import { audit, type Actor } from './access';
import { paging, sortBy } from './list';

const detailInclude = {
  items: { orderBy: { createdAt: 'asc' }, include: { prescription: true } },
  events: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' } },
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OrderInclude;
type DetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

const firstName = (address: unknown) => {
  const first = ((address as { fullName?: string }).fullName ?? '').split(/\s+/)[0];
  if (!first) return 'there';
  return first;
};

/**
 * Orders and the prescription queue for the store team. Status changes go
 * through the shared state machine; the customer hears about the ones that
 * matter to them.
 */
export class OrdersAdmin {
  constructor(
    private readonly db: Db,
    private readonly gateway: PaymentGateway,
    private readonly links: FileLinks,
    private readonly jobs: JobQueue,
    private readonly options: { siteUrl: string },
    private readonly log: Pick<FastifyBaseLogger, 'error'>,
  ) {}

  private state(order: DetailRow) {
    return {
      id: order.id,
      status: order.status,
      paymentProvider: order.paymentProvider,
      awaitingPrescription: order.awaitingPrescription,
      needsProduction: order.items.some((item) => item.lensConfig !== null),
    };
  }

  async list(query: AdminListQuery, filters: { status?: string; awaiting?: boolean }) {
    const status = orderStatuses.find((value) => value === filters.status);
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(filters.awaiting ? { awaitingPrescription: true } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q.toUpperCase() } },
              { email: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const column = sortBy(query, ['placedAt', 'totalMinor', 'number'], 'placedAt');
    const [rows, total] = await Promise.all([
      this.db.order.findMany({
        where,
        orderBy: { [column]: query.dir },
        select: {
          id: true,
          number: true,
          email: true,
          status: true,
          totalMinor: true,
          paymentProvider: true,
          awaitingPrescription: true,
          placedAt: true,
          shippingAddress: true,
          _count: { select: { items: true } },
        },
        ...paging(query),
      }),
      this.db.order.count({ where }),
    ]);
    const items = rows.map(({ shippingAddress, _count, ...row }) => ({
      ...row,
      customer: (shippingAddress as { fullName?: string }).fullName ?? '',
      items: _count.items,
    }));
    return { items, total };
  }

  async detail(id: string) {
    const order = await this.db.order.findUnique({ where: { id }, include: detailInclude });
    if (!order) throw new AppError('NOT_FOUND', 'That order does not exist.');
    const state = this.state(order);
    const context = {
      needsProduction: state.needsProduction,
      awaitingPrescription: state.awaitingPrescription,
      cashOnDelivery: state.paymentProvider === 'COD',
    };
    const nextStatuses = orderStatuses.filter(
      (to) => canTransition(order.status, to, context).allowed,
    );
    const { trackingTokenHash: _token, idempotencyHash: _hash, ...rest } = order;
    return {
      ...rest,
      nextStatuses,
      items: order.items.map((item) => ({
        ...item,
        prescription: item.prescription
          ? {
              id: item.prescription.id,
              status: item.prescription.status,
              values: item.prescription.values,
              fileUrl: item.prescription.fileKey
                ? this.links.url(item.prescription.fileKey, 600)
                : null,
              fileMime: item.prescription.fileMime,
              reviewNote: item.prescription.reviewNote,
            }
          : null,
      })),
    };
  }

  async transition(actor: Actor, id: string, input: z.infer<typeof orderTransitionSchema>) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id }, include: detailInclude });
      if (!order) throw new AppError('NOT_FOUND', 'That order does not exist.');
      if (input.to === 'IN_PRODUCTION' && order.awaitingPrescription)
        throw new AppError('CONFLICT', 'Approve the prescription before production starts.');
      await transition(tx, this.state(order), input.to, {
        ...(input.note ? { note: input.note } : {}),
        visibleToCustomer: input.visibleToCustomer,
        actorId: actor.id,
      });
      await audit(tx, actor, {
        action: 'order.transition',
        entityType: 'Order',
        entityId: id,
        before: { status: order.status },
        after: { status: input.to, note: input.note },
      });
    });
    return this.detail(id);
  }

  async update(actor: Actor, id: string, input: z.infer<typeof orderUpdateSchema>) {
    const before = await this.db.order.findUnique({
      where: { id },
      select: { internalNote: true, carrier: true, trackingNumber: true },
    });
    if (!before) throw new AppError('NOT_FOUND', 'That order does not exist.');
    await this.db.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: input });
      await audit(tx, actor, {
        action: 'order.update',
        entityType: 'Order',
        entityId: id,
        before,
        after: input,
      });
    });
    return this.detail(id);
  }

  /**
   * Refunds part or all of what was paid online. A full refund also moves
   * a cancelled or returned order to REFUNDED.
   */
  async refund(actor: Actor, id: string, input: z.infer<typeof orderRefundSchema>) {
    const order = await this.db.order.findUnique({ where: { id }, include: detailInclude });
    if (!order) throw new AppError('NOT_FOUND', 'That order does not exist.');
    const paid = order.payments.find((payment) => payment.status === 'SUCCEEDED');
    if (!paid?.providerRef)
      throw new AppError('CONFLICT', 'This order has no online payment to refund.');
    const refunded = order.refunds
      .filter((refund) => refund.status !== 'FAILED')
      .reduce((sum, refund) => sum + refund.amountMinor, 0);
    if (input.amountMinor > paid.amountMinor - refunded)
      throw new AppError(
        'CONFLICT',
        `At most ${paid.amountMinor - refunded} (minor units) can still be refunded.`,
      );
    const refund = await this.db.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          paymentId: paid.id,
          orderId: id,
          amountMinor: input.amountMinor,
          reason: input.reason,
          actorId: actor.id,
        },
      });
      await audit(tx, actor, {
        action: 'order.refund',
        entityType: 'Order',
        entityId: id,
        after: created,
      });
      return created;
    });
    try {
      const provider = this.gateway.provider(providerCode(order.paymentProvider));
      const { refundRef } = await provider.refund(paid.providerRef, input.amountMinor);
      await this.db.$transaction(async (tx) => {
        await tx.refund.update({
          where: { id: refund.id },
          data: { status: 'SUCCEEDED', providerRef: refundRef },
        });
        const full = refunded + input.amountMinor >= paid.amountMinor;
        if (full) {
          await tx.payment.update({ where: { id: paid.id }, data: { status: 'REFUNDED' } });
          if (order.status === 'CANCELLED' || order.status === 'RETURNED')
            await transition(tx, this.state(order), 'REFUNDED', {
              note: input.reason,
              actorId: actor.id,
            });
        }
      });
    } catch (error) {
      this.log.error({ err: error, orderId: id }, 'Admin refund failed');
      await this.db.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'The payment provider did not accept the refund. Try again.',
      );
    }
    return this.detail(id);
  }

  // ─── Prescription review queue ─────────────────────────────────────────

  async prescriptions(query: AdminListQuery, status: string | undefined) {
    const statuses = ['PENDING_REVIEW', 'VERIFIED', 'NEEDS_CORRECTION'] as const;
    const wanted = statuses.find((value) => value === status) ?? 'PENDING_REVIEW';
    // Only prescriptions attached to an order need review.
    const where: Prisma.PrescriptionWhereInput = {
      status: wanted,
      deletedAt: null,
      orderItems: { some: {} },
    };
    const [rows, total] = await Promise.all([
      this.db.prescription.findMany({
        where,
        orderBy: { createdAt: query.dir === 'asc' ? 'asc' : 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          orderItems: { select: { order: { select: { id: true, number: true, email: true } } } },
        },
        ...paging(query),
      }),
      this.db.prescription.count({ where }),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status,
      customer: row.user?.name ?? row.orderItems[0]?.order.email ?? '',
      orders: [...new Set(row.orderItems.map((item) => item.order.number))],
      hasFile: row.fileKey !== null,
      hasValues: row.values !== null,
      createdAt: row.createdAt,
    }));
    return { items, total };
  }

  async prescription(id: string) {
    const row = await this.db.prescription.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        verifiedBy: { select: { name: true } },
        orderItems: {
          select: {
            productName: true,
            order: { select: { id: true, number: true, status: true } },
          },
        },
      },
    });
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'That prescription does not exist.');
    const { ownerTokenHash: _hash, fileKey, ...rest } = row;
    return { ...rest, fileUrl: fileKey ? this.links.url(fileKey, 600) : null };
  }

  /**
   * Approves a prescription (orders waiting only on it move into
   * production) or asks the customer for a correction with a templated
   * message. Either way the customer gets an email.
   */
  async review(actor: Actor, id: string, input: PrescriptionReview) {
    const before = await this.prescription(id);
    const approved = input.decision === 'approve';
    const message = approved
      ? (input.note ?? '')
      : [correctionTemplates[input.template], input.note].filter(Boolean).join(' ');
    if (!approved && !message)
      throw new AppError('VALIDATION_FAILED', 'Write a note for the customer.');
    await this.db.$transaction(async (tx) => {
      await tx.prescription.update({
        where: { id },
        data: {
          status: approved ? 'VERIFIED' : 'NEEDS_CORRECTION',
          verifiedById: approved ? actor.id : null,
          verifiedAt: approved ? new Date() : null,
          reviewNote: message || null,
        },
      });
      const orderIds = [...new Set(before.orderItems.map((item) => item.order.id))];
      for (const orderId of orderIds) await this.afterReview(tx, actor, orderId, approved, message);
      await audit(tx, actor, {
        action: approved ? 'prescription.approve' : 'prescription.correction',
        entityType: 'Prescription',
        entityId: id,
        before: { status: before.status },
        after: { status: approved ? 'VERIFIED' : 'NEEDS_CORRECTION', message },
      });
    });
    await this.jobs.kickOutbox().catch(() => undefined);
    return this.prescription(id);
  }

  private async afterReview(
    tx: Tx,
    actor: Actor,
    orderId: string,
    approved: boolean,
    message: string,
  ) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: detailInclude,
    });
    const url = orderUrl(this.options.siteUrl, order.number, this.gateway.token(order.id));
    if (approved) {
      // Same rule as checkout: typed-in prescriptions never hold an order up.
      const stillWaiting = order.items.some((item) => {
        const mode = (item.lensConfig as { prescription?: { mode?: string } } | null)?.prescription
          ?.mode;
        const needsCheck = mode === 'later' || mode === 'upload' || mode === 'saved';
        return needsCheck && item.prescription?.status !== 'VERIFIED';
      });
      if (!stillWaiting && order.awaitingPrescription) {
        await tx.order.update({ where: { id: orderId }, data: { awaitingPrescription: false } });
        if (order.status === 'PRESCRIPTION_REVIEW')
          await transition(
            tx,
            { ...this.state(order), awaitingPrescription: false },
            'IN_PRODUCTION',
            {
              note: 'Prescription checked by an optician.',
              actorId: actor.id,
            },
          );
      }
    }
    await queueEmail(tx, order.email, {
      template: 'prescription-update',
      data: {
        number: order.number,
        customerName: firstName(order.shippingAddress),
        orderUrl: url,
        approved,
        message,
      },
    });
  }
}
