'use client';

import { Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { accountApi } from '@/lib/account-api';
import { notify } from '@/lib/notify';
import { useSavedLists } from '@/stores/saved-lists';

/**
 * Signed-in extras on the wishlist page: the list is refreshed from the
 * account (changes made on other devices appear), and it can be shared as
 * a read-only link, which can be replaced to stop sharing the old one.
 */
export function WishlistAccount() {
  const t = useTranslations('wishlistPage');
  const [shareToken, setShareToken] = useState<string | null>(null);

  useEffect(() => {
    accountApi.wishlist().then(
      (list) => {
        useSavedLists.setState({ wishlist: list.items });
        setShareToken(list.shareToken);
      },
      () => undefined,
    );
  }, []);

  const share = async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/wishlist/shared/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      void notify(t('copied'));
    } catch {
      void notify(t('copyFailed', { url }));
    }
  };

  return (
    <div className="mt-10 space-y-4 border-t border-hairline pt-6">
      <p className="text-caption text-ink-secondary">{t('syncedNote')}</p>
      {shareToken ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void share()}>
            <Link2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('share')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              accountApi.newShareLink().then(
                (list) => {
                  setShareToken(list.shareToken);
                  void notify(t('resetDone'));
                },
                () => undefined,
              );
            }}
          >
            {t('resetShare')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
