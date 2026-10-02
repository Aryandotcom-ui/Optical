'use client';

import { addressConfig } from '@optical/config/address';
import { commerce } from '@optical/config/commerce';
import { useTranslations } from 'next-intl';
import { withPostalLookup, type CheckoutDraft, type FieldErrors } from './checkout-draft';
import { SelectField, TextField } from './fields';

/** Delivery address: PIN code first, so city and state can be filled in from it. */
export function AddressFields({
  draft,
  errors,
  onChange,
}: {
  draft: CheckoutDraft;
  errors: FieldErrors;
  onChange: (draft: CheckoutDraft) => void;
}) {
  const t = useTranslations('checkout.delivery');
  const set = (patch: Partial<CheckoutDraft>) => {
    onChange({ ...draft, ...patch });
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id="checkout-name"
        label={t('fullName')}
        autoComplete="name"
        value={draft.fullName}
        error={errors.fullName}
        onChange={(event) => {
          set({ fullName: event.target.value });
        }}
        className="sm:col-span-2"
      />
      <TextField
        id="checkout-postal"
        label={commerce.postalCode.label}
        autoComplete="postal-code"
        inputMode="numeric"
        maxLength={6}
        value={draft.postalCode}
        error={errors.postalCode}
        hint={t('postalHint')}
        onChange={(event) => {
          onChange(withPostalLookup(draft, event.target.value.replace(/\D/g, '').slice(0, 6)));
        }}
      />
      <TextField
        id="checkout-line1"
        label={t('line1')}
        autoComplete="address-line1"
        value={draft.line1}
        error={errors.line1}
        onChange={(event) => {
          set({ line1: event.target.value });
        }}
        className="sm:col-span-2"
      />
      <TextField
        id="checkout-line2"
        label={t('line2')}
        autoComplete="address-line2"
        value={draft.line2}
        onChange={(event) => {
          set({ line2: event.target.value });
        }}
      />
      <TextField
        id="checkout-landmark"
        label={t('landmark')}
        value={draft.landmark}
        onChange={(event) => {
          set({ landmark: event.target.value });
        }}
      />
      <TextField
        id="checkout-city"
        label={t('city')}
        autoComplete="address-level2"
        value={draft.city}
        error={errors.city}
        onChange={(event) => {
          set({ city: event.target.value, autofilled: false });
        }}
      />
      <SelectField
        id="checkout-region"
        label={addressConfig.regionLabel}
        autoComplete="address-level1"
        value={draft.region}
        error={errors.region}
        onChange={(event) => {
          set({ region: event.target.value, autofilled: false });
        }}
      >
        <option value="">
          {t('chooseRegion', { label: addressConfig.regionLabel.toLowerCase() })}
        </option>
        {addressConfig.regions.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
