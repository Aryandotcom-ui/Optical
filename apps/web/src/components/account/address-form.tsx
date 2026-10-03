'use client';

import type { AddressInput, SavedAddress } from '@optical/shared/account';
import { addressConfig, normalisePhone } from '@optical/config/address';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { AddressFields } from '@/components/checkout/address-fields';
import {
  deliveryErrors,
  emptyCheckoutDraft,
  fieldFromPath,
  type CheckoutDraft,
  type FieldErrors,
} from '@/components/checkout/checkout-draft';
import { TextField } from '@/components/checkout/fields';
import { Button } from '@/components/ui/button';
import { CommerceError } from '@/lib/account-api';

export function draftFromAddress(address: SavedAddress): CheckoutDraft {
  return {
    ...emptyCheckoutDraft,
    phone: address.phone,
    fullName: address.fullName,
    line1: address.line1,
    line2: address.line2 ?? '',
    landmark: address.landmark ?? '',
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
  };
}

/** Add or edit a saved address, with the same fields and checks as checkout. */
export function AddressForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SavedAddress | null;
  onSave: (address: AddressInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('account.addresses');
  const tErrors = useTranslations('checkout.errors');
  const [draft, setDraft] = useState<CheckoutDraft>(
    initial ? draftFromAddress(initial) : emptyCheckoutDraft,
  );
  const [makeDefault, setMakeDefault] = useState(initial?.isDefault ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: FieldErrors = { ...deliveryErrors(draft, tErrors) };
    if (!normalisePhone(draft.phone))
      found.phone = tErrors('phone', { example: addressConfig.phone.example });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSave({
        fullName: draft.fullName.trim(),
        phone: draft.phone,
        line1: draft.line1.trim(),
        line2: draft.line2.trim() || null,
        landmark: draft.landmark.trim() || null,
        city: draft.city.trim(),
        region: draft.region,
        postalCode: draft.postalCode.trim(),
        isDefault: makeDefault,
      });
    } catch (error) {
      if (error instanceof CommerceError) {
        setFormError(error.message);
        const fields: FieldErrors = {};
        for (const detail of error.details) {
          const field = fieldFromPath(detail.path);
          if (field) fields[field] = detail.message;
        }
        setErrors(fields);
      } else setFormError(t('failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-labelledby="address-form-title"
      className="space-y-5 rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset sm:p-6"
    >
      <h2 id="address-form-title" className="text-title font-semibold">
        {initial ? t('editTitle') : t('addTitle')}
      </h2>
      <AddressFields draft={draft} errors={errors} onChange={setDraft} />
      <TextField
        id="address-phone"
        label={t('phone')}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={draft.phone}
        error={errors.phone}
        onChange={(event) => {
          setDraft({ ...draft, phone: event.target.value });
        }}
      />
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={makeDefault}
          onChange={(event) => {
            setMakeDefault(event.target.checked);
          }}
          className="size-5 accent-[var(--color-accent)]"
        />
        {t('setDefault')}
      </label>
      <p role="alert" className="text-caption text-danger-ink empty:hidden">
        {formError}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
