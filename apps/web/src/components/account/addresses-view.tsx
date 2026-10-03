'use client';

import type { SavedAddress } from '@optical/shared/account';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { accountApi } from '@/lib/account-api';
import { notify } from '@/lib/notify';
import { AddressForm } from './address-form';
import { LoadError, LoadingBlock } from './load-states';
import { useLoad } from './use-load';

const loadAddresses = () => accountApi.addresses();

export function AddressesView() {
  const t = useTranslations('account.addresses');
  const { state, reload, set } = useLoad(loadAddresses);
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, request: () => Promise<SavedAddress[]>, message?: string) => {
    setBusy(id);
    try {
      set(await request());
      if (message) void notify(message);
    } catch {
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-2 text-ink-secondary">{t('intro')}</p>
        </div>
        {editing === null ? (
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            {t('add')}
          </Button>
        ) : null}
      </header>

      {editing !== null ? (
        <AddressForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => {
            setEditing(null);
          }}
          onSave={async (address) => {
            if (editing === 'new') await accountApi.addAddress(address);
            else await accountApi.updateAddress(editing.id, address);
            set(await accountApi.addresses());
            setEditing(null);
            void notify(t('saved'));
          }}
        />
      ) : null}

      {state.status === 'loading' ? <LoadingBlock rows={2} /> : null}
      {state.status === 'error' ? <LoadError onRetry={reload} /> : null}
      {state.status === 'ready' && state.data.length === 0 && editing === null ? (
        <p className="text-ink-secondary">{t('empty')}</p>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {state.data.map((address) => (
            <li
              key={address.id}
              className="flex flex-col justify-between gap-4 rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset"
            >
              <address className="not-italic">
                <p className="font-medium">
                  {address.fullName}
                  {address.isDefault ? (
                    <span className="ml-2 rounded-pill bg-surface-muted px-2 py-0.5 align-middle text-[0.75rem] font-medium">
                      {t('default')}
                    </span>
                  ) : null}
                </p>
                <p className="text-ink-secondary">
                  {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')}
                </p>
                <p className="text-ink-secondary">
                  {address.city}, {address.region} {address.postalCode}
                </p>
                <p className="text-ink-secondary">{address.phone}</p>
              </address>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(address);
                  }}
                >
                  {t('edit')}
                </Button>
                {address.isDefault ? null : (
                  <Button
                    variant="ghost"
                    disabled={busy === address.id}
                    onClick={() =>
                      void act(address.id, () => accountApi.defaultAddress(address.id))
                    }
                  >
                    {t('makeDefault')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={busy === address.id}
                  aria-label={t('removeNamed', { name: address.fullName })}
                  onClick={() =>
                    void act(address.id, () => accountApi.removeAddress(address.id), t('removed'))
                  }
                >
                  {t('remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
