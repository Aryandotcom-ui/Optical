'use client';

import type { OrderList } from '@optical/shared/account';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { accountApi } from '@/lib/account-api';
import { LoadError, LoadingBlock } from './load-states';
import { OrderRows } from './order-list';

/** Every order, newest first, ten to a page. */
export function OrdersView() {
  const t = useTranslations('account.orders');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; list: OrderList }
  >({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    accountApi.orders(page).then(
      (list) => {
        if (current) setState({ status: 'ready', list });
      },
      () => {
        if (current) setState({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [page, attempt]);

  const pages =
    state.status === 'ready' ? Math.max(1, Math.ceil(state.list.total / state.list.pageSize)) : 1;
  return (
    <div className="space-y-6">
      <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
      {state.status === 'loading' ? <LoadingBlock /> : null}
      {state.status === 'error' ? (
        <LoadError
          onRetry={() => {
            setState({ status: 'loading' });
            setAttempt(attempt + 1);
          }}
        />
      ) : null}
      {state.status === 'ready' ? (
        state.list.items.length ? (
          <>
            <OrderRows orders={state.list.items} />
            {pages > 1 ? (
              <nav aria-label={t('title')} className="flex items-center justify-between gap-4">
                <Button
                  variant="secondary"
                  disabled={page === 1}
                  onClick={() => {
                    setState({ status: 'loading' });
                    setPage(page - 1);
                  }}
                >
                  {t('previous')}
                </Button>
                <p className="text-caption text-ink-secondary">{t('page', { page, pages })}</p>
                <Button
                  variant="secondary"
                  disabled={page >= pages}
                  onClick={() => {
                    setState({ status: 'loading' });
                    setPage(page + 1);
                  }}
                >
                  {t('next')}
                </Button>
              </nav>
            ) : null}
          </>
        ) : (
          <p className="text-ink-secondary">{t('empty')}</p>
        )
      ) : null}
    </div>
  );
}
