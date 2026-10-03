import { Suspense } from 'react';
import { HelpArticles } from '@/components/admin/content';

export default function AdminHelpArticlesPage() {
  return (
    <Suspense>
      <HelpArticles />
    </Suspense>
  );
}
