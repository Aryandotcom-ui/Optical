import type {
  AttachPrescription,
  Cart,
  CheckoutQuote,
  CheckoutQuoteRequest,
  OrderView,
  PlaceOrder,
  PlacedOrder,
  UploadedPrescription,
} from '@optical/shared/checkout';
import type { LensCatalog } from '@optical/shared/lens';
import { addToCart, bag, call, fetchCart } from './bag-api';

export { CommerceError } from './bag-api';

/** Checkout, payments and order pages: everything beyond adding to the bag. */
export const commerceApi = {
  lensOptions: () => call<LensCatalog>('GET', '/v1/lens/options'),
  cart: fetchCart,
  addToCart,
  updateQuantity: (itemId: string, quantity: number) =>
    bag(call<Cart>('PATCH', `/v1/cart/items/${itemId}`, { body: { quantity } })),
  removeItem: (itemId: string) => bag(call<Cart>('DELETE', `/v1/cart/items/${itemId}`)),
  applyCoupon: (code: string) => bag(call<Cart>('PUT', '/v1/cart/coupon', { body: { code } })),
  removeCoupon: () => bag(call<Cart>('DELETE', '/v1/cart/coupon')),
  quote: (request: CheckoutQuoteRequest) =>
    call<CheckoutQuote>('POST', '/v1/checkout/quote', { body: request }),
  placeOrder: (order: PlaceOrder, idempotencyKey: string) =>
    call<PlacedOrder>('POST', '/v1/checkout/orders', {
      body: order,
      headers: { 'idempotency-key': idempotencyKey },
    }),
  order: (number: string, token: string) =>
    call<OrderView>('GET', `/v1/orders/${encodeURIComponent(number)}`, {
      headers: { 'x-order-token': token },
    }),
  track: (number: string, email: string) =>
    call<{ order: OrderView; accessToken: string }>('POST', '/v1/orders/track', {
      body: { number, email },
    }),
  retryPayment: (number: string, token: string, provider: string) =>
    call<PlacedOrder>('POST', `/v1/orders/${encodeURIComponent(number)}/payment`, {
      body: { provider },
      headers: { 'x-order-token': token },
    }),
  simulatePayment: (paymentId: string, outcome: 'success' | 'failure' | 'pending', token: string) =>
    call<OrderView>('POST', '/v1/payments/mock/simulate', {
      body: { paymentId, outcome },
      headers: { 'x-order-token': token },
    }),
  uploadPrescription: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return call<UploadedPrescription>('POST', '/v1/prescriptions/uploads', { form });
  },
  attachPrescription: (number: string, token: string, request: AttachPrescription) =>
    call<OrderView>('POST', `/v1/orders/${encodeURIComponent(number)}/prescriptions`, {
      body: request,
      headers: { 'x-order-token': token },
    }),
};
