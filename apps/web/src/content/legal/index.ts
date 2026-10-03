import { privacyPolicy } from './privacy';
import { returnsPolicy } from './returns';
import { shippingPolicy } from './shipping';
import { termsOfUse } from './terms';
import type { LegalDocument, LegalSlug } from './types';

export { legalSlugs, type LegalDocument, type LegalSlug } from './types';

const documents: Record<LegalSlug, () => LegalDocument> = {
  privacy: privacyPolicy,
  terms: termsOfUse,
  returns: returnsPolicy,
  shipping: shippingPolicy,
};

export function legalDocument(slug: LegalSlug): LegalDocument {
  return documents[slug]();
}
