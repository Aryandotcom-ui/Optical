# Contributing

## Workflow

- `main` is protected and always deployable.
- Work on short-lived branches named `feat/…`, `fix/…`, `chore/…` or `docs/…`.
- Open a pull request; CI must pass and one review is required.
- PRs are **squash-merged**. The PR title becomes the commit message, so write it as a
  [Conventional Commit](https://www.conventionalcommits.org/): `feat(web): add frame colour swatches`.

## Before you push

```bash
pnpm check
```

This runs lint, typecheck, tests and build. A pre-commit hook formats staged files with Prettier,
and a pre-push hook runs the typecheck.

## Code standards

- TypeScript `strict` with `noUncheckedIndexedAccess`. No `any` without a comment explaining why.
- Zod schemas in `packages/shared` are the single source of truth for validation and types.
- API layering is `routes → controllers → services → repositories`. No business rules in routes,
  and no Prisma outside repositories.
- Domain rules are small, named, pure functions with unit tests.
- Keep files under about 400 lines; extract components, hooks and services.
- No `console.log` in application code; use the request logger.
- Money is integer minor units, always. Format with `formatMoney`.
- UI strings go through `next-intl` (`apps/web/messages/en.json`), never inline.
- Record design decisions as a short ADR in `docs/DECISIONS.md`.

## Copy

Warm, precise, short sentences. No exclamation marks, no hype words, no jargon without a one-line
explanation. A test enforces the basics.

## Product rules: things we never ship

- Popups on page load, exit-intent modals, newsletter interstitials, app-download overlays.
- Forced sign-in before cart, try-on or checkout.
- Countdown timers, fake scarcity ("only 2 left" unless stock really is 3 or fewer), fake
  "people viewing", or a struck-through price that was never charged.
- Auto-playing audio.
- More than one slim, dismissible announcement bar.
- Layout shift, infinite spinners, or filters that reset on back-navigation.
- Dead ends: every empty state has a next action, and every error says how to recover.

## Accessibility

WCAG 2.2 AA is the floor: keyboard operable, visible focus, correct headings and landmarks,
4.5:1 text contrast in both themes (design tokens are contrast-tested), and reduced-motion support.
