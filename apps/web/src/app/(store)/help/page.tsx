import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HelpShell, Paragraphs } from '@/components/help/help-shell';
import { getHelpArticles } from '@/lib/catalog';
import type messages from '../../../../messages/en.json';

type TopicName = keyof (typeof messages)['help']['centre']['topicNames'];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('help.centre');
  return { title: t('title'), description: t('intro'), alternates: { canonical: '/help' } };
}

export default async function HelpPage() {
  const [t, articles] = await Promise.all([getTranslations('help.centre'), getHelpArticles()]);
  const topics = [...new Set(articles.map((article) => article.topic))];
  // Topics are data; one added later without a translation still shows its raw name.
  const topicName = (topic: string) => {
    const key = `topicNames.${topic}` as `topicNames.${TopicName}`;
    return t.has(key) ? t(key) : topic;
  };

  return (
    <HelpShell current="/help" title={t('title')} intro={t('intro')}>
      <nav aria-label={t('topics')} className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <a
            key={topic}
            href={`#topic-${topic}`}
            className="inline-flex min-h-9 items-center rounded-pill bg-surface-muted px-4 text-caption font-medium hover:bg-hairline"
          >
            {topicName(topic)}
          </a>
        ))}
      </nav>
      <div className="mt-12 space-y-14">
        {topics.map((topic) => (
          <section key={topic} aria-labelledby={`topic-${topic}`} className="scroll-mt-24">
            <h2 id={`topic-${topic}`} className="text-headline font-semibold">
              {topicName(topic)}
            </h2>
            <div className="mt-4 divide-y divide-hairline">
              {articles
                .filter((article) => article.topic === topic)
                .map((article) => (
                  <article key={article.slug} id={article.slug} className="scroll-mt-24 py-5">
                    <h3 className="font-medium">
                      <a href={`#${article.slug}`} className="hover:text-accent">
                        {article.title}
                      </a>
                    </h3>
                    <div className="mt-2 space-y-3">
                      <Paragraphs text={article.body} />
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </HelpShell>
  );
}
