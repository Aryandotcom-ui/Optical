'use client';

import { isValidPostalCode } from '@optical/config/commerce';
import type { Cart, CheckoutQuote, PaymentProviderCode } from '@optical/shared/checkout';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CouponForm } from '@/components/bag/coupon-form';
import { OptionCard } from '@/components/configurator/option-card';
import { OrderSummary } from '@/components/bag/order-summary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CommerceError, commerceApi } from '@/lib/commerce-api';
import { formatPrice, formatShortDate } from '@/lib/format';
import { useSignedInHint } from '@/lib/signed-in';
import dynamic from 'next/dynamic';
import { AddressFields } from './address-fields';
import {
  applyPrefill,
  attemptKey,
  clearDraft,
  contactErrors,
  deliveryErrors,
  fieldFromPath,
  loadDraft,
  saveDraft,
  toPlaceOrder,
  type CheckoutDraft,
  type FieldErrors,
} from './checkout-draft';
import { SaveAddressToggle, SignInPrompt } from './checkout-sign-in';
import { CheckoutSection, TextField } from './fields';
import { PaymentOptions } from './payment-options';
import { SummaryItems } from './summary-items';

type Step = 'contact' | 'delivery' | 'payment';

// Account extras load only for signed-in customers.
const AccountPrefill = dynamic(() =>
  import('./checkout-account').then((module) => module.AccountPrefill),
);
const SavedAddresses = dynamic(() =>
  import('./checkout-account').then((module) => module.SavedAddresses),
);

/**
 * Single-page checkout: contact, delivery and payment, each validated as
 * you go and collapsible once done. Everything typed survives a reload.
 * The server prices every step and has the final word on the total.
 */
/** The first available online method, else cash on delivery. */
function defaultProvider(quote: CheckoutQuote): PaymentProviderCode | null {
  const usable = quote.paymentOptions
    .filter((option) => option.available)
    .map((option) => option.provider);
  return usable.find((code) => code !== 'cod') ?? usable[0] ?? null;
}

export function CheckoutView() {
  const t = useTranslations('checkout');
  const tErrors = useTranslations('checkout.errors');
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null | 'error'>(null);
  // Restored from this tab; the form only renders after the bag loads, so markup still matches the server.
  const [draft, setDraft] = useState<CheckoutDraft>(loadDraft);
  const [step, setStep] = useState<Step>('contact');
  const [errors, setErrors] = useState<FieldErrors>({});
  // The quote and the choices it was priced for: Place order waits until they match.
  const [quoted, setQuoted] = useState<{ key: string; quote: CheckoutQuote } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const signedIn = useSignedInHint();

  useEffect(() => {
    commerceApi.cart().then(setCart, () => {
      setCart('error');
    });
  }, []);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // Re-price whenever something that changes the total changes.
  const postalCode = isValidPostalCode(draft.postalCode) ? draft.postalCode : undefined;
  const cartVersion =
    cart && cart !== 'error'
      ? `${cart.itemCount}:${cart.couponCode ?? ''}:${cart.pricing.totalMinor}`
      : null;
  const quoteKey = JSON.stringify([cartVersion, draft.speed, postalCode, draft.provider]);
  useEffect(() => {
    if (!cartVersion || cartVersion.startsWith('0:')) return;
    let cancelled = false;
    const key = quoteKey;
    const timer = setTimeout(() => {
      commerceApi
        .quote({
          shippingSpeed: draft.speed,
          ...(postalCode ? { postalCode } : {}),
          ...(draft.provider ? { paymentProvider: draft.provider } : {}),
        })
        .then(
          (next) => {
            if (cancelled) return;
            setQuoted({ key, quote: next });
            // Nothing chosen yet: select the default method, which re-prices with
            // its fee (cash on delivery) before Place order is enabled.
            const fallback = defaultProvider(next);
            if (fallback)
              setDraft((current) =>
                current.provider ? current : { ...current, provider: fallback },
              );
          },
          () => undefined,
        );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cartVersion, draft.speed, postalCode, draft.provider, quoteKey]);
  const quote = quoted?.quote ?? null;
  const quoteCurrent = quoted?.key === quoteKey;

  // The chosen payment method, or the first one available for this order.
  const provider =
    draft.provider &&
    quote?.paymentOptions.some((option) => option.available && option.provider === draft.provider)
      ? draft.provider
      : quote
        ? defaultProvider(quote)
        : null;

  const update = (next: CheckoutDraft) => {
    setDraft(next);
    setProblem(null);
  };
  const advance = (from: Step) => {
    const found =
      from === 'contact'
        ? contactErrors(draft, tErrors)
        : from === 'delivery'
          ? deliveryErrors(draft, tErrors)
          : {};
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document
        .getElementById(
          `checkout-${first === 'postalCode' ? 'postal' : first === 'fullName' ? 'name' : first}`,
        )
        ?.focus();
      return;
    }
    setStep(from === 'contact' ? 'delivery' : 'payment');
  };

  const place = async () => {
    if (!quote || !provider) return;
    const all = { ...contactErrors(draft, tErrors), ...deliveryErrors(draft, tErrors) };
    if (Object.keys(all).length > 0) {
      setErrors(all);
      setStep(Object.keys(contactErrors(draft, tErrors)).length > 0 ? 'contact' : 'delivery');
      return;
    }
    setPlacing(true);
    setProblem(null);
    const order = toPlaceOrder({ ...draft, provider }, quote.pricing.totalMinor);
    try {
      const placed = await commerceApi.placeOrder(order, attemptKey(order));
      clearDraft();
      if (placed.payment?.kind === 'redirect') {
        window.location.assign(placed.payment.url);
        return;
      }
      router.replace(
        `/order/${placed.order.number}?token=${encodeURIComponent(placed.accessToken)}`,
      );
    } catch (error) {
      setPlacing(false);
      if (!(error instanceof CommerceError)) {
        setProblem(t('placeFailed'));
        return;
      }
      const fieldErrors: FieldErrors = {};
      for (const detail of error.details) {
        const field = fieldFromPath(detail.path);
        if (field) fieldErrors[field] = detail.message;
      }
      setErrors(fieldErrors);
      setProblem(error.message);
      if (error.code === 'PRICE_CHANGED' || error.code === 'OUT_OF_STOCK') {
        commerceApi.cart().then(setCart, () => undefined);
      }
    }
  };

  if (cart === null) return <Skeleton className="h-96 w-full rounded-card" />;
  if (cart === 'error') return <p className="text-danger-ink">{t('loadFailed')}</p>;
  if (cart.items.length === 0)
    return (
      <div className="rounded-media bg-surface-muted px-6 py-16 text-center">
        <h2 className="text-headline font-semibold">{t('emptyTitle')}</h2>
        <Button asChild size="lg" className="mt-6">
          <Link href="/shop">{t('browse')}</Link>
        </Button>
      </div>
    );

  const pricing = quote?.pricing ?? cart.pricing;
  const summary = (
    <div className="space-y-6">
      <SummaryItems items={cart.items} />
      <OrderSummary pricing={pricing} deliveryKnown={postalCode !== undefined} />
      <CouponForm
        applied={cart.couponCode}
        onApply={async (code) => {
          setCart(await commerceApi.applyCoupon(code));
        }}
        onRemove={async () => {
          setCart(await commerceApi.removeCoupon());
        }}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
      <details className="group rounded-card bg-surface-muted p-5 lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
          <span>{t('showSummary')}</span>
          <span className="tabular">{formatPrice(pricing.totalMinor)}</span>
        </summary>
        <div className="mt-5">{summary}</div>
      </details>

      <div className="space-y-4">
        {signedIn ? (
          <AccountPrefill
            draft={draft}
            onPrefill={(patch) => {
              setDraft((current) => applyPrefill(current, patch));
            }}
          />
        ) : (
          <SignInPrompt />
        )}
        <CheckoutSection
          number={1}
          title={t('contact.title')}
          open={step === 'contact'}
          summary={draft.email ? `${draft.email} · ${draft.phone}` : null}
          onEdit={() => {
            setStep('contact');
          }}
          editLabel={t('edit')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="checkout-email"
              label={t('contact.email')}
              type="email"
              autoComplete="email"
              value={draft.email}
              error={errors.email}
              hint={t('contact.emailHint')}
              onChange={(event) => {
                update({ ...draft, email: event.target.value });
              }}
            />
            <TextField
              id="checkout-phone"
              label={t('contact.phone')}
              type="tel"
              autoComplete="tel"
              value={draft.phone}
              error={errors.phone}
              hint={t('contact.phoneHint')}
              onChange={(event) => {
                update({ ...draft, phone: event.target.value });
              }}
            />
          </div>
          <Button
            className="mt-5"
            onClick={() => {
              advance('contact');
            }}
          >
            {t('continue')}
          </Button>
        </CheckoutSection>

        <CheckoutSection
          number={2}
          title={t('delivery.title')}
          open={step === 'delivery'}
          summary={
            step === 'payment'
              ? `${draft.fullName}, ${draft.line1}, ${draft.city} ${draft.postalCode} · ${t(`delivery.${draft.speed}`)}`
              : null
          }
          onEdit={() => {
            setStep('delivery');
          }}
          editLabel={t('edit')}
        >
          {signedIn ? <SavedAddresses draft={draft} onChange={update} /> : null}
          <AddressFields draft={draft} errors={errors} onChange={update} />
          {signedIn ? (
            <SaveAddressToggle
              checked={draft.saveAddress}
              onChange={(saveAddress) => {
                update({ ...draft, saveAddress });
              }}
            />
          ) : null}
          <fieldset className="mt-6">
            <legend className="font-medium">{t('delivery.speed')}</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(['standard', 'express'] as const).map((speed) => {
                const window = quote?.delivery[speed];
                return (
                  <OptionCard
                    key={speed}
                    type="radio"
                    name="speed"
                    value={speed}
                    checked={draft.speed === speed}
                    onChange={() => {
                      update({ ...draft, speed });
                    }}
                    title={t(`delivery.${speed}`)}
                    description={
                      window
                        ? t('delivery.window', {
                            from: formatShortDate(window.earliest),
                            to: formatShortDate(window.latest),
                          })
                        : t('delivery.windowPending')
                    }
                  />
                );
              })}
            </div>
          </fieldset>
          <Button
            className="mt-5"
            onClick={() => {
              advance('delivery');
            }}
          >
            {t('continue')}
          </Button>
        </CheckoutSection>

        <CheckoutSection
          number={3}
          title={t('payment.title')}
          open={step === 'payment'}
          summary={null}
          onEdit={() => {
            setStep('payment');
          }}
          editLabel={t('edit')}
        >
          {quote ? (
            <PaymentOptions
              options={quote.paymentOptions}
              value={provider}
              onChange={(next) => {
                update({ ...draft, provider: next });
              }}
            />
          ) : (
            <Skeleton className="h-32 w-full rounded-card" />
          )}
          <p aria-live="assertive" className="mt-4 text-danger-ink empty:hidden">
            {problem}
          </p>
          <Button
            size="lg"
            className="mt-5 w-full sm:w-auto"
            disabled={placing || !quoteCurrent || !provider}
            onClick={() => void place()}
          >
            {placing
              ? t('placing')
              : quoteCurrent
                ? t('place', { total: formatPrice(pricing.totalMinor) })
                : t('updatingTotal')}
          </Button>
          <p className="mt-3 text-caption text-ink-secondary">{t('terms')}</p>
        </CheckoutSection>
      </div>

      <aside
        aria-label={t('summaryLabel')}
        className="hidden h-fit rounded-card bg-surface-muted p-6 lg:sticky lg:top-24 lg:block"
      >
        {summary}
      </aside>
    </div>
  );
}
