/**
 * Brand identity. This is the only place the brand name is written down;
 * every UI string, email template and metadata tag reads it from here.
 */
export interface BrandConfig {
  /** Full trading name, used in titles, emails and invoices. */
  readonly name: string;
  /** Short form for tight spaces (mobile header, favicon title). */
  readonly shortName: string;
  /** Lowercase wordmark as rendered in the logo. */
  readonly wordmark: string;
  /** One-line positioning statement for metadata and the footer. */
  readonly tagline: string;
  /** Longer description for SEO metadata and OpenGraph cards. */
  readonly description: string;
  /** Customer-facing support address. */
  readonly supportEmail: string;
  /** Registered legal entity shown on invoices and legal pages. */
  readonly legalName: string;
  /** Prefix for human-friendly order numbers, e.g. LO-26-001234. */
  readonly orderNumberPrefix: string;
  /** Theme colour for the browser UI (matches the light background token). */
  readonly themeColor: { readonly light: string; readonly dark: string };
}

export const brand: BrandConfig = {
  name: 'Lumen Optics',
  shortName: 'Lumen',
  wordmark: 'lumen',
  tagline: 'Glasses, made clear.',
  description:
    'Prescription glasses, sunglasses and computer glasses with honest pricing, lenses explained in plain language, and on-device virtual try-on.',
  supportEmail: 'help@lumenoptics.example',
  legalName: 'Lumen Optics Private Limited',
  orderNumberPrefix: 'LO',
  themeColor: { light: '#FBFBFD', dark: '#000000' },
};
