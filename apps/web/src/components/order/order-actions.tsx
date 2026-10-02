'use client';

import type { ReturnRequest } from '@optical/shared/account';
import type { OrderView } from '@optical/shared/checkout';
import { commerce } from '@optical/config/commerce';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommerceError, orderActionsApi } from '@/lib/account-api';
import { notify } from '@/lib/notify';

type Panel = 'cancel' | 'return' | null;

// Kept here rather than imported, so the order page loads no schema code.
const returnReasons = [
  'fit',
  'style',
  'vision',
  'damaged',
  'wrong-item',
  'other',
] as const satisfies readonly ReturnRequest['reason'][];

const textarea =
  'mt-1 min-h-20 w-full rounded-card bg-surface px-4 py-3 ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent focus:outline-none';

/**
 * Self-service for a placed order: invoice, buy again, cancel (before it
 * is made) and return (within the window after delivery). Each shows only
 * when the API says it's possible.
 */
export function OrderActions({
  order,
  token,
  onChange,
}: {
  order: OrderView;
  token: string;
  onChange: (order: OrderView) => void;
}) {
  const t = useTranslations('order.actions');
  const format = useFormatter();
  const [panel, setPanel] = useState<Panel>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<ReturnRequest['reason']>('fit');
  const [reordered, setReordered] = useState<string | null>(null);
  const { actions } = order;

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof CommerceError ? caught.message : t('failed'));
    } finally {
      setPending(null);
    }
  };

  if (!actions.cancel && !actions.requestReturn && !actions.invoice && !actions.reorder)
    return null;
  return (
    <section aria-labelledby="order-actions" className="space-y-4">
      <h2 id="order-actions" className="text-title font-semibold">
        {t('title')}
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.invoice ? (
          <Button
            variant="secondary"
            disabled={pending === 'invoice'}
            onClick={() =>
              void run('invoice', async () => {
                try {
                  await orderActionsApi.downloadInvoice(order.number, token);
                } catch {
                  throw new Error(t('invoiceFailed'));
                }
              })
            }
          >
            {t('invoice')}
          </Button>
        ) : null}
        {actions.reorder ? (
          <Button
            variant="secondary"
            disabled={pending === 'reorder'}
            onClick={() =>
              void run('reorder', async () => {
                const result = await orderActionsApi.reorder(order.number, token);
                const parts = [t('reordered', { count: result.added })];
                if (result.skipped.length)
                  parts.push(
                    t('reorderSkipped', {
                      items: result.skipped
                        .map((item) => `${item.name} (${item.reason})`)
                        .join('; '),
                    }),
                  );
                setReordered(parts.join(' '));
              })
            }
          >
            {pending === 'reorder' ? t('reordering') : t('reorder')}
          </Button>
        ) : null}
        {actions.requestReturn ? (
          <Button
            variant="secondary"
            aria-expanded={panel === 'return'}
            onClick={() => {
              setPanel(panel === 'return' ? null : 'return');
            }}
          >
            {t('return')}
          </Button>
        ) : null}
        {actions.cancel ? (
          <Button
            variant="ghost"
            aria-expanded={panel === 'cancel'}
            onClick={() => {
              setPanel(panel === 'cancel' ? null : 'cancel');
            }}
          >
            {t('cancel')}
          </Button>
        ) : null}
      </div>

      {reordered ? (
        <p role="status" className="text-caption">
          {reordered}{' '}
          <Link href="/cart" className="font-medium text-accent underline-offset-4 hover:underline">
            {t('viewBag')}
          </Link>
        </p>
      ) : null}

      {panel === 'cancel' && actions.cancel ? (
        <form
          className="space-y-4 rounded-card bg-surface-muted p-5"
          aria-labelledby="cancel-title"
          onSubmit={(event) => {
            event.preventDefault();
            void run('cancel', async () => {
              const next = await orderActionsApi.cancel(
                order.number,
                token,
                note.trim() || undefined,
              );
              setPanel(null);
              onChange(next);
              void notify(t('cancelled'));
            });
          }}
        >
          <h3 id="cancel-title" className="font-semibold">
            {t('cancelTitle')}
          </h3>
          <p className="text-ink-secondary">{t('cancelBody')}</p>
          <label className="block text-caption font-medium">
            {t('cancelNote')}
            <textarea
              className={textarea}
              maxLength={500}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending === 'cancel'}>
              {pending === 'cancel' ? t('cancelling') : t('cancelConfirm')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPanel(null);
              }}
            >
              {t('cancelKeep')}
            </Button>
          </div>
        </form>
      ) : null}

      {panel === 'return' && actions.requestReturn && actions.returnUntil ? (
        <form
          className="space-y-4 rounded-card bg-surface-muted p-5"
          aria-labelledby="return-title"
          onSubmit={(event) => {
            event.preventDefault();
            void run('return', async () => {
              const next = await orderActionsApi.requestReturn(order.number, token, {
                reason,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
              setPanel(null);
              onChange(next);
              void notify(t('returned'));
            });
          }}
        >
          <h3 id="return-title" className="font-semibold">
            {t('returnTitle')}
          </h3>
          <p className="text-ink-secondary">
            {t('returnBody', {
              days: commerce.policies.returnWindowDays,
              date: format.dateTime(new Date(actions.returnUntil), { dateStyle: 'long' }),
            })}
          </p>
          <fieldset className="space-y-1">
            <legend className="text-caption font-medium">{t('returnReason')}</legend>
            {returnReasons.map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="return-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => {
                    setReason(value);
                  }}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {t(`reasons.${value}`)}
              </label>
            ))}
          </fieldset>
          <label className="block text-caption font-medium">
            {t('returnNote')}
            <textarea
              className={textarea}
              maxLength={500}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </label>
          <Button type="submit" disabled={pending === 'return'}>
            {pending === 'return' ? t('returning') : t('returnConfirm')}
          </Button>
        </form>
      ) : null}

      <p role="alert" className="text-caption text-danger-ink empty:hidden">
        {error}
      </p>
    </section>
  );
}
