import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthLayout } from '@/components/auth/auth-layout';
import { ResetPasswordForm } from '@/components/auth/recovery-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  // The token is in the fragment, but never send this page's URL anywhere regardless.
  return { title: t('resetTitle'), robots: { index: false }, referrer: 'no-referrer' };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <AuthLayout title={t('resetTitle')} intro={t('resetIntro')}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
