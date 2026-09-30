import { getRequestConfig } from 'next-intl/server';

/**
 * Message catalogue selection. English ships complete; the structure is
 * ready for more catalogues (e.g. `hi`) once locale routing is added.
 */
export const defaultMessageLocale = 'en';

export default getRequestConfig(async () => {
  const locale = defaultMessageLocale;
  const messages = (await import(`../../messages/${locale}.json`)) as { default: IntlMessages };
  return { locale, messages: messages.default };
});
