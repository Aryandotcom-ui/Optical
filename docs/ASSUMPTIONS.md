# Assumptions

These are the assumptions the build proceeds on. Each one is a default, not a
fixed requirement: change it here and in the linked config, and the code
follows.

## Product and market

| #   | Assumption                                                                                                                                                                                                                        | Where it lives                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A1  | Brand name is **Lumen Optics**. It is referenced only through `brand.name`.                                                                                                                                                       | `packages/config/src/brand.ts`    |
| A2  | Primary market is India: currency `INR`, locale `en-IN`, 6-digit PIN codes. Nothing else in the code assumes India.                                                                                                               | `packages/config/src/commerce.ts` |
| A3  | Prices are **tax-inclusive**. GST at 12% is extracted from the inclusive price and shown as an invoice line, never added on top.                                                                                                  | `commerce.tax`                    |
| A4  | Money is stored as **integer minor units** (paise for INR). Rounding is half-away-from-zero at each line, then summed.                                                                                                            | `packages/shared/src/money`       |
| A5  | Contact lenses are out of scope. Products are frames, prescription lenses, sunglasses, computer glasses, kids' frames, and accessories.                                                                                           | Catalogue seed (Phase 1)          |
| A6  | Free-shipping threshold, returns window, warranty length and dispatch times are business settings, stored in config now and editable from admin in Phase 6.                                                                       | `commerce.policies`               |
| A7  | Legal pages are drafts written for India. They are flagged "review with a lawyer before launch" in `docs/`, not in the UI.                                                                                                        | `docs/LEGAL.md`                   |
| A8  | Launch prices (tax-inclusive): frames ₹1,290–₹7,990; single-vision lenses from ₹1,190, progressive from ₹3,990; zero-power lenses included free.                                                                                  | Seed, `defaultLensCatalog`        |
| A9  | Shipping zones: metro PIN prefixes (Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad) are a day faster; J&K, Ladakh, the North East and Andaman & Nicobar are remote (₹50 surcharge, 3 extra days). Sundays are non-working. | `commerce.shipping`               |
| A10 | "Low stock" is shown only at 3 units or fewer, and the exact count only then.                                                                                                                                                     | `stockStateFor`                   |
| A11 | Frames launched within 45 days are labelled new.                                                                                                                                                                                  | `NEW_PRODUCT_DAYS`                |
| A12 | Progressive lenses need at least 28 mm of lens height; rimless frames need 1.61 or thinner lenses; polarised lenses aren't made in 1.74.                                                                                          | Lens rules (data)                 |
| A13 | Refunds reach the original payment method within 5 to 7 working days of a return arriving; cash-on-delivery orders are refunded to a UPI ID or bank account.                                                                      | Help and legal returns pages      |
| A14 | Returns are started by email until accounts exist (Phase 4); a free pickup is offered within one working day. Damaged or wrong items must be reported within 48 hours.                                                            | `src/content/legal/returns.ts`    |
| A15 | Disputes fall under the courts of Bengaluru, Karnataka; the support address doubles as the grievance contact until a named officer is appointed.                                                                                  | `src/content/legal/*.ts`          |
| A16 | Order and invoice records are kept for eight years (Indian tax law); server logs for 90 days.                                                                                                                                     | Privacy policy                    |
| A17 | A frame "suits" a face shape at an affinity of 0.75 or more.                                                                                                                                                                      | `FACE_SHAPE_MATCH`                |
| A18 | "Compare with your glasses" estimates a frame's total width as two lens widths, the bridge and 5 mm of hinge block on each side.                                                                                                  | `fit-diagram.tsx`                 |
| A19 | The lens-thickness illustration is a paraxial estimate for a −4.00 lens, 60 mm across, with a 1.5 mm centre.                                                                                                                      | `lens-visuals.tsx`                |

## Engineering

| #   | Assumption                                                                                                                                                                                                           | Notes                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| E1  | **Node 22 LTS**, not Node 20. Node 20 reached end-of-life in April 2026, and Vitest 5 requires Node ≥ 22.12.                                                                                                         | ADR-002                                 |
| E2  | **pnpm 10** workspaces with Turborepo.                                                                                                                                                                               | `packageManager` field pins the version |
| E3  | `pnpm setup` is a built-in pnpm command (it configures `PNPM_HOME`) and cannot be overridden by a script. The one-shot command is therefore **`pnpm run setup`** (alias: `pnpm bootstrap`).                          | ADR-006                                 |
| E4  | Internal packages (`@optical/config`, `@optical/shared`) ship TypeScript source. Next.js transpiles them; the API bundles them for production.                                                                       | ADR-003                                 |
| E5  | **Tailwind CSS v4** is the current stable release. Its configuration is CSS-first, so the "Tailwind preset" is a shared CSS file of `@theme` tokens rather than a `tailwind.config.js`.                              | ADR-004                                 |
| E6  | TypeScript **5.9** rather than 6.x/7.x: the whole lint and type toolchain supports it without caveats.                                                                                                               | ADR-002                                 |
| E7  | ESLint **9** (flat config) rather than 10: several React and a11y plugins do not yet declare ESLint 10 support.                                                                                                      | ADR-002                                 |
| E8  | Local services run in Docker Compose. If Docker is unavailable, any Postgres 16 + Redis 7 + SMTP sink works; only `.env` needs to change.                                                                            | README troubleshooting                  |
| E9  | A single root `.env` file configures every app. Next.js and the API both load it from the repo root.                                                                                                                 | ADR-005                                 |
| E10 | The repository already contains an **MIT** `LICENSE` chosen by the owner. The spec suggested an `UNLICENSED` placeholder; the owner's existing choice wins.                                                          | `LICENSE`                               |
| E11 | The package scope is `@optical/*` (the repo name), so renaming the brand never touches import paths.                                                                                                                 |                                         |
| E12 | `packages/ui` is not created until there is a second consumer for shared UI primitives. The storefront and admin both live in `apps/web`, so for now primitives live in `apps/web/src/components/ui`.                | ADR-007                                 |
| E13 | The storefront Content-Security-Policy is introduced with MediaPipe in Phase 5 (tightened in Phase 7), once the exact `worker-src` and `wasm-unsafe-eval` needs are known. Other security headers ship from Phase 0. | ADR-008                                 |
| E14 | Phase 2 browser testing is Chromium (desktop and Pixel 7 emulation). Firefox and WebKit join in Phase 7.                                                                                                             | `playwright.config.ts`                  |

## Git

- One commit per phase, Conventional Commits.
- The repository already had a GitHub remote (`origin`) when work began, and this work is developed on the branch `claude/bold-sagan-iwwvg0`. Work is pushed to that branch only; `main` is not touched.
