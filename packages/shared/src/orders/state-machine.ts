/**
 * Order lifecycle. Every status change goes through `canTransition`, which
 * encodes both the allowed edges and the order-specific guards (frame-only
 * orders skip lens production; cash-on-delivery orders are fulfilled before
 * payment is collected).
 */
export const orderStatuses = [
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'PAID',
  'PRESCRIPTION_REVIEW',
  'IN_PRODUCTION',
  'QUALITY_CHECK',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export interface OrderContext {
  /** True when any item has prescription or made-to-order lenses. */
  needsProduction: boolean;
  /** True while a prescription still has to be received or verified. */
  awaitingPrescription: boolean;
  cashOnDelivery: boolean;
}

const edges: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: [
    'PAID',
    'PAYMENT_FAILED',
    'CANCELLED',
    'PRESCRIPTION_REVIEW',
    'IN_PRODUCTION',
    'SHIPPED',
  ],
  PAYMENT_FAILED: ['PENDING_PAYMENT', 'CANCELLED'],
  PAID: ['PRESCRIPTION_REVIEW', 'IN_PRODUCTION', 'SHIPPED', 'CANCELLED'],
  PRESCRIPTION_REVIEW: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['QUALITY_CHECK'],
  QUALITY_CHECK: ['SHIPPED', 'IN_PRODUCTION'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

/** Statuses a customer may cancel from: before anything is made or shipped. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'PAID',
  'PRESCRIPTION_REVIEW',
];

export type TransitionCheck = { allowed: true } | { allowed: false; reason: string };

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  context: OrderContext,
): TransitionCheck {
  const deny = (reason: string): TransitionCheck => ({ allowed: false, reason });
  if (!edges[from].includes(to)) return deny(`An order can't move from ${from} to ${to}.`);

  const fulfilmentStates: readonly OrderStatus[] = [
    'PRESCRIPTION_REVIEW',
    'IN_PRODUCTION',
    'SHIPPED',
  ];
  if (from === 'PENDING_PAYMENT' && fulfilmentStates.includes(to) && !context.cashOnDelivery) {
    return deny('Prepaid orders must be paid before fulfilment starts.');
  }
  if (to === 'PAID' && context.cashOnDelivery) {
    return deny('Cash-on-delivery orders are paid on delivery.');
  }
  const productionStates: readonly OrderStatus[] = [
    'PRESCRIPTION_REVIEW',
    'IN_PRODUCTION',
    'QUALITY_CHECK',
  ];
  if (productionStates.includes(to) && !context.needsProduction) {
    return deny('Frame-only orders skip lens production.');
  }
  if (to === 'IN_PRODUCTION' && context.awaitingPrescription) {
    return deny('Production starts only after the prescription is verified.');
  }
  if (to === 'PRESCRIPTION_REVIEW' && !context.awaitingPrescription) {
    return deny('There is no prescription waiting for review.');
  }
  if (
    to === 'SHIPPED' &&
    (from === 'PAID' || from === 'PENDING_PAYMENT') &&
    context.needsProduction
  ) {
    return deny('Lenses must be made and checked before shipping.');
  }
  return { allowed: true };
}

export function nextStatuses(from: OrderStatus, context: OrderContext): OrderStatus[] {
  return edges[from].filter((to) => canTransition(from, to, context).allowed);
}

/**
 * The normal route from placement to delivery for an order, used to build
 * timelines and to show customers what comes next.
 */
export function happyPath(
  context: Omit<OrderContext, 'awaitingPrescription'> & { prescriptionProvidedLater: boolean },
): OrderStatus[] {
  const path: OrderStatus[] = ['PENDING_PAYMENT'];
  if (!context.cashOnDelivery) path.push('PAID');
  if (context.needsProduction) {
    if (context.prescriptionProvidedLater) path.push('PRESCRIPTION_REVIEW');
    path.push('IN_PRODUCTION', 'QUALITY_CHECK');
  }
  path.push('SHIPPED', 'DELIVERED');
  return path;
}

/** Customer-facing wording for each status. */
export const orderStatusCopy: Record<OrderStatus, { label: string; description: string }> = {
  PENDING_PAYMENT: {
    label: 'Awaiting payment',
    description: 'We are waiting for your payment to be confirmed.',
  },
  PAYMENT_FAILED: {
    label: 'Payment failed',
    description: 'Your payment did not go through. You can try again from your order page.',
  },
  PAID: { label: 'Order confirmed', description: 'Payment received. We are preparing your order.' },
  PRESCRIPTION_REVIEW: {
    label: 'Prescription check',
    description: 'An optician is checking your prescription before your lenses are made.',
  },
  IN_PRODUCTION: {
    label: 'Lenses being made',
    description: 'Your lenses are being cut and fitted to your frame.',
  },
  QUALITY_CHECK: {
    label: 'Quality check',
    description: 'We are checking your lenses against your prescription.',
  },
  SHIPPED: { label: 'Shipped', description: 'Your order is on its way.' },
  DELIVERED: { label: 'Delivered', description: 'Your order has been delivered.' },
  CANCELLED: { label: 'Cancelled', description: 'This order was cancelled.' },
  RETURN_REQUESTED: {
    label: 'Return requested',
    description: 'We have your return request and will arrange a pickup.',
  },
  RETURNED: { label: 'Returned', description: 'We have received your return.' },
  REFUNDED: {
    label: 'Refunded',
    description: 'Your refund has been issued. Banks usually take 5 to 7 working days.',
  },
};
