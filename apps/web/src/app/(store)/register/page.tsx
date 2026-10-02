import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthLayout } from '@/components/auth/auth-layout';
import { RegisterForm } from '@/components/auth/sign-in-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('registerTitle'), robots: { index: false } };
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [t, { next }] = await Promise.all([getTranslations('auth'), searchParams]);
  return (
    <AuthLayout title={t('registerTitle')} intro={t('registerIntro')}>
      <RegisterForm next={typeof next === 'string' ? next : undefined} />
    </AuthLayout>
  );
}
