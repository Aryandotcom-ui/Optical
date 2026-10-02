import { addressConfig, lookupPostalCode, normalisePhone } from '@optical/config/address';
import { commerce, isValidPostalCode } from '@optical/config/commerce';
import type { PaymentProviderCode, PlaceOrder } from '@optical/shared/checkout';

/** What the customer has typed at checkout. Kept in this tab (sessionStorage) so a reload loses nothing. */
export interface CheckoutDraft {
  email: string;
  phone: string;
  fullName: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  region: string;
  postalCode: string;
  speed: 'standard' | 'express';
  provider: PaymentProviderCode | null;
  /** True while city and region hold values filled in from the PIN code. */
  autofilled: boolean;
}

export const emptyCheckoutDraft: CheckoutDraft = {
  email: '',
  phone: '',
  fullName: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  region: '',
  postalCode: '',
  speed: 'standard',
  provider: null,
  autofilled: false,
};

const DRAFT_KEY = 'checkout-draft';
const ATTEMPT_KEY = 'checkout-attempt';

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadDraft(): CheckoutDraft {
  try {
    const raw = session()?.getItem(DRAFT_KEY);
    return raw
      ? { ...emptyCheckoutDraft, ...(JSON.parse(raw) as Partial<CheckoutDraft>) }
      : emptyCheckoutDraft;
  } catch {
    return emptyCheckoutDraft;
  }
}

export function saveDraft(draft: CheckoutDraft): void {
  try {
    session()?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the form still works, it just won't survive a reload.
  }
}

export function clearDraft(): void {
  try {
    session()?.removeItem(DRAFT_KEY);
    session()?.removeItem(ATTEMPT_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * The idempotency key for placing this order. The same order details reuse
 * the same key (a double click or a retry after a dropped connection can't
 * create two orders); changed details get a new one.
 */
export function attemptKey(order: PlaceOrder): string {
  const payload = JSON.stringify(order);
  try {
    const stored = session()?.getItem(ATTEMPT_KEY);
    const previous = stored ? (JSON.parse(stored) as { key: string; payload: string }) : null;
    if (previous?.payload === payload) return previous.key;
  } catch {
    // Fall through to a new key.
  }
  const key = crypto.randomUUID();
  try {
    session()?.setItem(ATTEMPT_KEY, JSON.stringify({ key, payload }));
  } catch {
    // The key still protects this page view.
  }
  return key;
}

/** Fills city and region from a complete PIN code, unless the customer typed their own. */
export function withPostalLookup(draft: CheckoutDraft, postalCode: string): CheckoutDraft {
  const next = { ...draft, postalCode };
  const found = isValidPostalCode(postalCode) ? lookupPostalCode(postalCode) : null;
  const canFill = draft.autofilled || (!draft.city && !draft.region);
  if (!found || !canFill) return next;
  return {
    ...next,
    region: found.region,
    city: found.city ?? (draft.autofilled ? '' : draft.city),
    autofilled: true,
  };
}

export type FieldErrors = Partial<Record<keyof CheckoutDraft, string>>;
type ErrorKey = 'email' | 'phone' | 'fullName' | 'line1' | 'city' | 'region' | 'postalCode';
/** The `checkout.errors` translator. */
type Messages = (key: ErrorKey, values?: Record<string, string>) => string;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactErrors(draft: CheckoutDraft, t: Messages): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL.test(draft.email.trim())) errors.email = t('email');
  if (!normalisePhone(draft.phone))
    errors.phone = t('phone', { example: addressConfig.phone.example });
  return errors;
}

export function deliveryErrors(draft: CheckoutDraft, t: Messages): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.fullName.trim().length < 2) errors.fullName = t('fullName');
  if (draft.line1.trim().length < 3) errors.line1 = t('line1');
  if (draft.city.trim().length < 2) errors.city = t('city');
  if (!addressConfig.regions.includes(draft.region))
    errors.region = t('region', { label: addressConfig.regionLabel.toLowerCase() });
  if (!isValidPostalCode(draft.postalCode))
    errors.postalCode = t('postalCode', {
      label: commerce.postalCode.label,
      example: commerce.postalCode.example,
    });
  return errors;
}

export function toPlaceOrder(draft: CheckoutDraft, expectedTotalMinor: number): PlaceOrder {
  return {
    contact: { email: draft.email.trim(), phone: draft.phone },
    address: {
      fullName: draft.fullName.trim(),
      line1: draft.line1.trim(),
      line2: draft.line2.trim() || null,
      landmark: draft.landmark.trim() || null,
      city: draft.city.trim(),
      region: draft.region,
      postalCode: draft.postalCode.trim(),
    },
    shippingSpeed: draft.speed,
    paymentProvider: draft.provider ?? 'mock',
    expectedTotalMinor,
  };
}

/** Maps a server field path ("body.address.postalCode") to the form field. */
export function fieldFromPath(path: string): keyof CheckoutDraft | null {
  const last = path.split('.').at(-1) ?? '';
  return last in emptyCheckoutDraft ? (last as keyof CheckoutDraft) : null;
}
