#!/usr/bin/env node
/**
 * `pnpm preflight [path/to/production.env]`: everything to check before a
 * release. Validates the production environment file, then runs the same
 * gates as CI (format, lint, typecheck, tests with coverage, build). Exits
 * non-zero on the first failure. `--env-only` skips the gates.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const envOnly = args.includes('--env-only');
const envPath = args.find((arg) => !arg.startsWith('--')) ?? 'infra/deploy/production.env';

const problems = [];
const warnings = [];

function parseEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);

function checkEnv(env) {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'APP_SECRET',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_API_URL',
    'API_PUBLIC_URL',
    'CORS_ALLOWED_ORIGINS',
    'SMTP_URL',
  ];
  for (const key of required) if (!env[key]) problems.push(`${key} is not set.`);
  if (env.NODE_ENV !== 'production') problems.push('NODE_ENV must be production.');
  if ((env.APP_SECRET ?? '').length < 32)
    problems.push('APP_SECRET must be at least 32 characters (openssl rand -base64 48).');
  if (/change-me/i.test(env.DATABASE_URL ?? '') || /change-me/i.test(env.POSTGRES_PASSWORD ?? ''))
    problems.push('The database password is still the example value.');
  if (env.MOCK_PAYMENTS_ENABLED === 'true')
    problems.push('MOCK_PAYMENTS_ENABLED must not be true in production.');
  if (env.COOKIE_SECURE === 'false')
    problems.push('COOKIE_SECURE must not be false in production.');
  for (const key of ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_API_URL', 'API_PUBLIC_URL']) {
    const url = env[key] ?? '';
    if (url && !url.startsWith('https://') && !isLocal(url))
      problems.push(`${key} must use https:// (${url}).`);
    if (url && isLocal(url))
      warnings.push(`${key} points at localhost: fine for a local trial only.`);
  }
  const origins = (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim());
  if (env.NEXT_PUBLIC_SITE_URL && !origins.includes(env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')))
    problems.push('CORS_ALLOWED_ORIGINS must include NEXT_PUBLIC_SITE_URL.');
  const razorpay = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
  const stripe = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  for (const group of [razorpay, stripe]) {
    const set = group.filter((key) => env[key]);
    if (set.length > 0 && set.length < group.length)
      problems.push(`Set ${group.join(', ')} together, or none of them.`);
  }
  if (![...razorpay, ...stripe].some((key) => env[key]))
    warnings.push(
      'No online payment provider is configured: only cash on delivery will be offered.',
    );
  if (env.API_DOCS_ENABLED !== 'false')
    warnings.push('API docs are public (set API_DOCS_ENABLED=false).');
  if (env.TRUST_PROXY !== 'true')
    warnings.push('TRUST_PROXY is off: behind a load balancer, rate limits will see its IP only.');
  if (/mailpit|localhost/.test(env.SMTP_URL ?? ''))
    warnings.push('SMTP_URL points at a local mail catcher: customers will not receive email.');
}

console.log(`Preflight: checking ${envPath}`);
if (existsSync(envPath)) checkEnv(parseEnvFile(envPath));
else
  problems.push(`${envPath} not found. Copy infra/deploy/production.env.example and fill it in.`);

for (const warning of warnings) console.log(`  ! ${warning}`);
for (const problem of problems) console.log(`  ✗ ${problem}`);
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s) in the environment. Fix them and run again.`);
  process.exit(1);
}
console.log('  ✓ environment');
if (envOnly) process.exit(0);

const gates = [
  ['format', ['pnpm', 'format:check']],
  ['lint', ['pnpm', 'lint']],
  ['typecheck', ['pnpm', 'typecheck']],
  ['tests and coverage', ['pnpm', 'test:coverage']],
  ['build', ['pnpm', 'build']],
];
for (const [name, [command, ...rest]] of gates) {
  console.log(`\n▶ ${name}`);
  const result = spawnSync(command, rest, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.log(`\n✗ ${name} failed. Fix it before releasing.`);
    process.exit(result.status ?? 1);
  }
}
console.log(
  '\n✓ Preflight passed. Next: build the images and run the e2e suite against them (DEPLOYMENT.md).',
);
