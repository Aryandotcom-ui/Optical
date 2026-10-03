'use client';

import type { LensKind } from '@optical/shared/admin';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { adminGet, adminSend } from './admin-api';
import { useCanWrite } from './admin-context';
import { Check, Field, PageHeader, Panel, useAction } from './ui';

interface Option {
  code: string;
  name: string;
  description?: string;
  benefit?: string;
  priceMinor?: number;
  basePriceMinor?: number;
  sortOrder: number;
  isActive: boolean;
}
interface Rule {
  id: string;
  reason: string;
  isActive: boolean;
}
type Catalogue = Record<LensKind, Option[]> & { rules: Rule[] };

const SECTIONS: { kind: LensKind; title: string }[] = [
  { kind: 'purposes', title: 'Lens types (base price)' },
  { kind: 'indexes', title: 'Thickness (index)' },
  { kind: 'packages', title: 'Coating packages' },
  { kind: 'coatings', title: 'Individual coatings' },
  { kind: 'tints', title: 'Tints' },
];

/**
 * Lens prices, availability and compatibility rules, editable without a
 * deploy. Changes apply to new quotes at once; placed orders keep their prices.
 */
export function LensCatalogue() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const canWrite = useCanWrite('lens');
  useEffect(() => {
    adminGet<Catalogue>('/lens').then(setCatalogue, () => undefined);
  }, []);
  if (!catalogue) return <p aria-live="polite">Loading…</p>;
  return (
    <>
      <PageHeader
        title="Lens catalogue"
        description="Prices include tax. Placed orders keep the prices they were sold at."
      />
      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <Panel key={section.kind} title={section.title}>
            <ul className="divide-y divide-hairline">
              {catalogue[section.kind].map((option) => (
                <OptionRow
                  key={option.code}
                  kind={section.kind}
                  option={option}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          </Panel>
        ))}
        <Panel title="Compatibility rules">
          <p className="mb-3 text-caption text-ink-secondary">
            Each rule blocks an option combination in the configurator, with the reason shown to the
            customer.
          </p>
          <ul className="divide-y divide-hairline">
            {catalogue.rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} canWrite={canWrite} />
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function OptionRow({
  kind,
  option,
  canWrite,
}: {
  kind: LensKind;
  option: Option;
  canWrite: boolean;
}) {
  const action = useAction();
  const price = option.priceMinor ?? option.basePriceMinor ?? 0;
  const [form, setForm] = useState({
    name: option.name,
    price: String(price / 100),
    isActive: option.isActive,
    sortOrder: String(option.sortOrder),
  });
  return (
    <li className="py-3">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_9rem_6rem_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(() =>
            adminSend('PATCH', `/lens/${kind}/${option.code}`, {
              name: form.name,
              priceMinor: Math.round(Number(form.price) * 100),
              sortOrder: Number(form.sortOrder),
              isActive: form.isActive,
            }),
          );
        }}
      >
        <Field
          label={`Name (${option.code})`}
          disabled={!canWrite}
          value={form.name}
          onChange={(event) => {
            setForm({ ...form, name: event.target.value });
          }}
          hint={option.description ?? option.benefit}
        />
        <Field
          label="Price (₹)"
          type="number"
          min="0"
          step="0.01"
          disabled={!canWrite}
          value={form.price}
          onChange={(event) => {
            setForm({ ...form, price: event.target.value });
          }}
          hint={`Now ${formatPrice(price)}`}
        />
        <Field
          label="Order"
          type="number"
          min="0"
          disabled={!canWrite}
          value={form.sortOrder}
          onChange={(event) => {
            setForm({ ...form, sortOrder: event.target.value });
          }}
        />
        <Check
          label="Offered"
          disabled={!canWrite}
          checked={form.isActive}
          onChange={(event) => {
            setForm({ ...form, isActive: event.target.checked });
          }}
        />
        {canWrite ? (
          <Button type="submit" variant="secondary" disabled={action.busy}>
            Save
          </Button>
        ) : null}
      </form>
      {action.status}
    </li>
  );
}

function RuleRow({ rule, canWrite }: { rule: Rule; canWrite: boolean }) {
  const action = useAction();
  const [form, setForm] = useState({ reason: rule.reason, isActive: rule.isActive });
  return (
    <li className="py-3">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(() => adminSend('PATCH', `/lens-rules/${rule.id}`, form));
        }}
      >
        <Field
          label={`Reason shown (${rule.id})`}
          disabled={!canWrite}
          value={form.reason}
          onChange={(event) => {
            setForm({ ...form, reason: event.target.value });
          }}
        />
        <Check
          label="Enforced"
          disabled={!canWrite}
          checked={form.isActive}
          onChange={(event) => {
            setForm({ ...form, isActive: event.target.checked });
          }}
        />
        {canWrite ? (
          <Button type="submit" variant="secondary" disabled={action.busy}>
            Save
          </Button>
        ) : null}
      </form>
      {action.status}
    </li>
  );
}
