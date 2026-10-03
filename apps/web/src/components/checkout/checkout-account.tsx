'use client';

import type { SavedAddress } from '@optical/shared/account';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { accountApi } from '@/lib/account-api';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import type { CheckoutDraft } from './checkout-draft';

const addressPatch = (address: SavedAddress): Partial<CheckoutDraft> => ({
  fullName: address.fullName,
  line1: address.line1,
  line2: address.line2 ?? '',
  landmark: address.landmark ?? '',
  city: address.city,
  region: address.region,
  postalCode: address.postalCode,
  autofilled: false,
});

const sameAddress = (draft: CheckoutDraft, address: SavedAddress) =>
  draft.line1 === address.line1 &&
  draft.postalCode === address.postalCode &&
  draft.fullName === address.fullName;

/**
 * Signed-in checkout: fills in the email, phone and default address from
 * the account (only into empty fields; nothing typed is overwritten).
 */
export function AccountPrefill({
  draft,
  onPrefill,
}: {
  draft: CheckoutDraft;
  /** Applied by the form only to fields that are still empty when it arrives. */
  onPrefill: (patch: Partial<CheckoutDraft>) => void;
}) {
  const session = useSession();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || session.status !== 'signed-in') return;
    done.current = true;
    const user = session.user;
    const contact: Partial<CheckoutDraft> = {
      ...(draft.email ? {} : { email: user.email }),
      ...(draft.phone || !user.phone ? {} : { phone: user.phone }),
    };
    accountApi.addresses().then(
      (addresses) => {
        const preferred = addresses.find((address) => address.isDefault);
        onPrefill({
          ...contact,
          ...(preferred && !draft.line1 && !draft.postalCode ? addressPatch(preferred) : {}),
          ...(preferred && !draft.phone && !contact.phone ? { phone: preferred.phone } : {}),
        });
      },
      () => {
        if (Object.keys(contact).length) onPrefill(contact);
      },
    );
  }, [session, draft, onPrefill]);
  return null;
}

/** The account's saved addresses as one-tap choices above the address form. */
export function SavedAddresses({
  draft,
  onChange,
}: {
  draft: CheckoutDraft;
  onChange: (draft: CheckoutDraft) => void;
}) {
  const t = useTranslations('checkout.account');
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  useEffect(() => {
    accountApi.addresses().then(setAddresses, () => undefined);
  }, []);
  if (addresses.length === 0) return null;
  return (
    <fieldset className="mb-6">
      <legend className="font-medium">{t('savedAddresses')}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {addresses.map((address) => {
          const selected = sameAddress(draft, address);
          return (
            <label
              key={address.id}
              className={cn(
                'flex cursor-pointer gap-3 rounded-card bg-surface p-4 ring-1 ring-inset',
                selected ? 'ring-2 ring-ink' : 'ring-hairline hover:ring-ink-secondary',
              )}
            >
              <input
                type="radio"
                name="saved-address"
                checked={selected}
                onChange={() => {
                  onChange({
                    ...draft,
                    ...addressPatch(address),
                    phone: draft.phone || address.phone,
                    saveAddress: false,
                  });
                }}
                className="mt-1 size-4 accent-[var(--color-accent)]"
              />
              <span className="text-caption">
                <span className="block text-body font-medium">{address.fullName}</span>
                {address.line1}, {address.city} {address.postalCode}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-caption text-ink-secondary">{t('newAddress')}</p>
    </fieldset>
  );
}
