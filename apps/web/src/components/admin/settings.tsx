'use client';

import type { MarketSettings } from '@optical/shared/admin';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminGet, adminSend } from './admin-api';
import { useCanWrite } from './admin-context';
import { Check, Field, PageHeader, Panel, toMinor, toRupees, useAction } from './ui';

interface StoreSettings {
  market: MarketSettings;
  flags: { key: string; enabled: boolean }[];
}

const FLAG_COPY: Record<string, { label: string; hint: string }> = {
  virtualTryOn: {
    label: 'Virtual try-on',
    hint: 'The camera try-on on product pages. Runs on the shopper’s device; no images leave it.',
  },
  frameFinder: { label: 'Frame Finder', hint: 'The face-shape and style quiz.' },
};

const MONEY: {
  key: Exclude<keyof MarketSettings, 'codEnabled' | 'lowStockThreshold'>;
  label: string;
}[] = [
  { key: 'freeShippingThresholdMinor', label: 'Free delivery from (₹)' },
  { key: 'standardFeeMinor', label: 'Standard delivery fee (₹)' },
  { key: 'expressFeeMinor', label: 'Express delivery fee (₹)' },
  { key: 'codFeeMinor', label: 'Cash on delivery fee (₹)' },
  { key: 'codMaxOrderTotalMinor', label: 'Cash on delivery up to (₹)' },
];

/**
 * Values the team can change without a deploy. Tax rates and delivery
 * zones stay in code because they also change legal copy (ADR-052).
 */
export function Settings() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const canWrite = useCanWrite('settings');
  useEffect(() => {
    adminGet<StoreSettings>('/settings').then(setSettings, () => undefined);
  }, []);
  if (!settings) return <p aria-live="polite">Loading…</p>;
  return (
    <>
      <PageHeader
        title="Settings"
        description="Changes apply to new quotes within seconds. Placed orders keep the terms they were sold on."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <MarketForm initial={settings.market} canWrite={canWrite} onSaved={setSettings} />
        <Panel title="Features">
          <ul className="space-y-4">
            {settings.flags.map((flag) => (
              <FlagRow key={flag.key} flag={flag} canWrite={canWrite} />
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function MarketForm({
  initial,
  canWrite,
  onSaved,
}: {
  initial: MarketSettings;
  canWrite: boolean;
  onSaved: (next: StoreSettings) => void;
}) {
  const action = useAction();
  const [form, setForm] = useState(
    () =>
      ({
        ...Object.fromEntries(MONEY.map(({ key }) => [key, toRupees(initial[key])])),
        codEnabled: initial.codEnabled,
        lowStockThreshold: String(initial.lowStockThreshold),
      }) as Record<(typeof MONEY)[number]['key'], string> & {
        codEnabled: boolean;
        lowStockThreshold: string;
      },
  );
  return (
    <Panel title="Delivery, payment and stock">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const body: MarketSettings = {
            freeShippingThresholdMinor: toMinor(form.freeShippingThresholdMinor),
            standardFeeMinor: toMinor(form.standardFeeMinor),
            expressFeeMinor: toMinor(form.expressFeeMinor),
            codFeeMinor: toMinor(form.codFeeMinor),
            codMaxOrderTotalMinor: toMinor(form.codMaxOrderTotalMinor),
            codEnabled: form.codEnabled,
            lowStockThreshold: Number(form.lowStockThreshold),
          };
          void action
            .run(() => adminSend<StoreSettings>('PUT', '/settings/market', body), 'Settings saved.')
            .then((next) => {
              if (next) onSaved(next);
            });
        }}
      >
        {MONEY.map(({ key, label }) => (
          <Field
            key={key}
            label={label}
            type="number"
            min="0"
            step="0.01"
            required
            disabled={!canWrite}
            value={form[key]}
            onChange={(event) => {
              setForm({ ...form, [key]: event.target.value });
            }}
          />
        ))}
        <Field
          label="Low-stock warning at (units)"
          hint="Default for new colours; each colour can override it under Inventory."
          type="number"
          min="0"
          required
          disabled={!canWrite}
          value={form.lowStockThreshold}
          onChange={(event) => {
            setForm({ ...form, lowStockThreshold: event.target.value });
          }}
        />
        <Check
          label="Offer cash on delivery"
          disabled={!canWrite}
          checked={form.codEnabled}
          onChange={(event) => {
            setForm({ ...form, codEnabled: event.target.checked });
          }}
        />
        {canWrite ? (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={action.busy}>
              Save settings
            </Button>
            {action.status}
          </div>
        ) : null}
      </form>
    </Panel>
  );
}

function FlagRow({
  flag,
  canWrite,
}: {
  flag: { key: string; enabled: boolean };
  canWrite: boolean;
}) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const action = useAction();
  const copy = FLAG_COPY[flag.key] ?? { label: flag.key, hint: '' };
  return (
    <li>
      <Check
        label={copy.label}
        checked={enabled}
        disabled={!canWrite || action.busy}
        onChange={(event) => {
          const next = event.target.checked;
          void action
            .run(
              () => adminSend('PUT', `/settings/flags/${flag.key}`, { enabled: next }),
              next ? 'Switched on.' : 'Switched off.',
            )
            .then((done) => {
              if (done) setEnabled(next);
            });
        }}
      />
      {copy.hint ? <p className="text-caption text-ink-secondary">{copy.hint}</p> : null}
      {action.status}
    </li>
  );
}
