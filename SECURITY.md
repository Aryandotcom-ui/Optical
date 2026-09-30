# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub security advisories](https://github.com/Aryandotcom-ui/Optical/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge
reports within 3 business days and to agree a fix and disclosure timeline with you.

## Scope

This repository contains the storefront, API and admin panel. Customer data handled here
includes contact details, addresses and optical prescriptions, which we treat as sensitive health
information.

## Practices

- Secrets never live in the repository. `.env*` files are git-ignored except `.env.example`.
- All input is validated with Zod at the API boundary; queries are parameterised.
- The API sends a `default-src 'none'` CSP, `nosniff`, and a strict CORS allow-list.
- Errors never expose stack traces or internal messages; each carries a request ID instead.
- Camera-based features (try-on, face-shape detection, PD measurement) run entirely on the device.
  No images or face landmarks are transmitted or stored.
- Dependencies are audited in CI and weekly, and Dependabot keeps them current.

Authentication, upload hardening, rate limiting and the full CSP are introduced in their phases
(see the roadmap in README.md) and documented here as they land.
