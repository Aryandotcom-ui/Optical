import type { AttachPrescription, OrderView } from '@optical/shared/checkout';
import { attachPrescriptionSchema } from '@optical/shared/checkout';
import type { LensConfig } from '@optical/shared/lens';
import { hasBlockingIssues, validatePrescription } from '@optical/shared/rx';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';
import type { PaymentGateway } from '../payments/payment-gateway';
import { toOrderView } from './orders.mapper';

/** Customer-facing order pages: view with the private link, track by number and email, add a prescription. */
export class OrdersService {
  constructor(
    private readonly db: Db,
    private readonly gateway: PaymentGateway,
  ) {}

  async view(number: string, token: string | undefined): Promise<OrderView> {
    return toOrderView(await this.gateway.authorisedOrder(number, token));
  }

  /** Same answer for a wrong number and a wrong email, so neither can be guessed. */
  async track(number: string, email: string): Promise<{ order: OrderView; accessToken: string }> {
    const order = await this.db.order.findUnique({
      where: { number },
      select: { id: true, email: true },
    });
    const notFound = () =>
      AppError.notFound('No order matches that number and email. Check both and try again.');
    if (!order) throw notFound();
    if (order.email !== email) throw notFound();
    const token = this.gateway.token(order.id);
    return { order: await this.view(number, token), accessToken: token };
  }

  /**
   * Adds a prescription to a lens item that was ordered with "send it later"
   * (or replaces a photo the optician couldn't read). An optician still
   * checks it before the lenses are made.
   */
  async attachPrescription(
    number: string,
    token: string | undefined,
    sessionHash: string | null,
    input: AttachPrescription,
  ): Promise<OrderView> {
    const request = attachPrescriptionSchema.parse(input);
    const order = await this.gateway.authorisedOrder(number, token);
    const item = order.items.find((entry) => entry.id === request.itemId);
    const config = item?.lensConfig as LensConfig | null | undefined;
    if (!item || !config?.prescription)
      throw AppError.notFound('That item does not need a prescription.');
    if (
      config.prescription.mode === 'manual' ||
      ['CANCELLED', 'SHIPPED', 'DELIVERED'].includes(order.status)
    )
      throw new AppError('CONFLICT', 'This order already has its prescription.');

    let prescriptionId: string;
    if (request.source.mode === 'upload') {
      const upload = sessionHash
        ? await this.db.prescription.findFirst({
            where: {
              id: request.source.uploadId,
              ownerTokenHash: sessionHash,
              fileKey: { not: null },
            },
            select: { id: true },
          })
        : null;
      if (!upload)
        throw new AppError('VALIDATION_FAILED', 'We could not find that upload. Upload it again.');
      prescriptionId = upload.id;
    } else {
      const issues = validatePrescription(request.source.rx, {
        requiresAdd: config.purpose === 'progressive',
      });
      if (hasBlockingIssues(issues))
        throw new AppError(
          'VALIDATION_FAILED',
          'Some prescription values need attention.',
          issues
            .filter((issue) => issue.severity === 'error')
            .map((issue) => ({ path: `source.rx.${issue.path}`, message: issue.message })),
        );
      const created = await this.db.prescription.create({
        data: {
          label: `Order ${order.number}`,
          values: request.source.rx,
          ownerTokenHash: sessionHash,
        },
      });
      prescriptionId = created.id;
    }
    await this.db.$transaction([
      this.db.orderItem.update({ where: { id: item.id }, data: { prescriptionId } }),
      this.db.orderEvent.create({
        data: {
          orderId: order.id,
          toStatus: order.status,
          fromStatus: order.status,
          note: `Prescription received for ${item.productName}.`,
          visibleToCustomer: false,
        },
      }),
    ]);
    return this.view(number, token);
  }
}
