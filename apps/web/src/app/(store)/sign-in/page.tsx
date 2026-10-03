import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthLayout } from '@/components/auth/auth-layout';
import { SignInForm } from '@/components/auth/sign-in-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('signInTitle'), robots: { index: false } };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [t, { next }] = await Promise.all([getTranslations('auth'), searchParams]);
  return (
    <AuthLayout title={t('signInTitle')} intro={t('signInIntro')}>
      <SignInForm next={typeof next === 'string' ? next : undefined} />
    </AuthLayout>
  );
}
