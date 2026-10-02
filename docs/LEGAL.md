# Legal pages

> **Review with a lawyer before launch.** The policy pages are drafts written for an online optical
> store in India. They are a reasonable starting point, not legal advice.

| Page              | Source                                   | Points to check                                                                                                  |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/legal/privacy`  | `apps/web/src/content/legal/privacy.ts`  | DPDP Act 2023 notice requirements, consent records, grievance officer, retention periods, processors named.      |
| `/legal/terms`    | `apps/web/src/content/legal/terms.ts`    | Consumer Protection (E-Commerce) Rules 2020 disclosures, prescription wording, jurisdiction (Bengaluru assumed). |
| `/legal/returns`  | `apps/web/src/content/legal/returns.ts`  | Refund timelines, made-to-order lens wording, warranty exclusions.                                               |
| `/legal/shipping` | `apps/web/src/content/legal/shipping.ts` | Zone list, surcharges and cash-on-delivery limits (all read from `packages/config/src/commerce.ts`).             |

Every number in these pages (return window, warranty, fees, thresholds, dispatch days) comes from
`packages/config`, so changing a setting updates the page. Change `LEGAL_UPDATED` in
`apps/web/src/content/legal/types.ts` whenever the wording changes.

The draft assumes the business details in [ASSUMPTIONS.md](ASSUMPTIONS.md) (A13 to A16). Some
statements describe how the store will work once later phases ship (accounts, encrypted
prescription storage, analytics consent); confirm them before launch.
