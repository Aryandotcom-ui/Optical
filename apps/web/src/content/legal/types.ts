export const legalSlugs = ['privacy', 'terms', 'returns', 'shipping'] as const;
export type LegalSlug = (typeof legalSlugs)[number];

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  /** Optional bullet list shown after the paragraphs. */
  list?: string[];
}

/**
 * A legal page. The text is long-form content rather than interface copy,
 * so it lives here instead of the message catalogue, and every number in it
 * (days, fees, thresholds) is read from the commerce settings.
 */
export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  summary: string;
  /** YYYY-MM-DD. */
  updated: string;
  sections: LegalSection[];
}

/** Date of the current drafts. Update it whenever a document changes. */
export const LEGAL_UPDATED = '2026-10-01';
