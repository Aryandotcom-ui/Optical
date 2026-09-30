#!/usr/bin/env node
/**
 * One-time local setup: `pnpm run setup` (alias `pnpm bootstrap`).
 *
 *   1. checks Node and pnpm versions
 *   2. installs dependencies
 *   3. creates .env from .env.example (never overwrites)
 *   4. starts Postgres, Redis and Mailpit in Docker and waits until healthy
 *
 * Flags:
 *   --skip-install   don't run `pnpm install`
 *   --skip-docker    use your own Postgres/Redis (set DATABASE_URL and REDIS_URL in .env)
 *
 * Uses only Node built-ins so it can run before dependencies are installed.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const MIN_NODE = [22, 12];

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const step = (text) => console.log(`\n${paint('1', '→')} ${paint('1', text)}`);
const ok = (text) => console.log(`  ${paint('32', '✓')} ${text}`);
const fail = (lines) => {
  console.error(`\n${paint('31', '✗')} ${lines.join('\n  ')}\n`);
  process.exit(1);
};

function run(command, commandArgs, { quiet = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

step('Checking tools');
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
  fail([
    `Node ${process.versions.node} is too old; this project needs Node ${MIN_NODE.join('.')} or newer.`,
    'Run `nvm use` (the repo has an .nvmrc) or install Node 22 LTS.',
  ]);
}
ok(`Node ${process.versions.node}`);
const pnpm = run('pnpm', ['--version'], { quiet: true });
if (!pnpm.ok) fail(['pnpm is not installed. Run `corepack enable`, then try again.']);
ok(`pnpm ${pnpm.stdout.trim()}`);

if (!args.has('--skip-install')) {
  step('Installing dependencies');
  if (!run('pnpm', ['install']).ok) fail(['`pnpm install` failed; see the output above.']);
  ok('Dependencies installed');
}

step('Preparing environment file');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  ok('.env already exists; left unchanged');
} else {
  copyFileSync(join(root, '.env.example'), envPath);
  ok('Created .env from .env.example');
}

if (args.has('--skip-docker')) {
  step('Skipping Docker services');
  ok('Using the Postgres and Redis configured in .env');
} else {
  step('Starting Postgres, Redis and Mailpit');
  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], { quiet: true });
  if (!docker.ok) {
    fail([
      'Docker is not running, so the local database and cache cannot start.',
      'Start Docker Desktop (or the Docker daemon) and run `pnpm run setup` again.',
      'To use your own Postgres 16 and Redis 7 instead, set DATABASE_URL and REDIS_URL',
      'in .env and run `pnpm run setup --skip-docker`.',
    ]);
  }
  if (!run('docker', ['compose', 'up', '-d', '--wait']).ok) {
    fail([
      'Docker services did not become healthy.',
      'If a port is busy, change POSTGRES_PORT / REDIS_PORT / MAILPIT_* in .env',
      '(and DATABASE_URL / REDIS_URL to match), then run setup again.',
      'Inspect logs with `pnpm docker:logs`.',
    ]);
  }
  ok('Services are healthy');
}

console.log(`
${paint('32', 'Setup complete.')} Start everything with:

  ${paint('1', 'pnpm dev')}

  Storefront      http://localhost:3000
  System status   http://localhost:3000/status
  API             http://localhost:4000
  API docs        http://localhost:4000/docs
  Mailpit inbox   http://localhost:8025
`);
