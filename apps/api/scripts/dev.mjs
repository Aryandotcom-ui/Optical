#!/usr/bin/env node
/**
 * `pnpm dev` for the API package: runs the HTTP server and the background
 * worker side by side, both reloading on change. Stopping one stops both.
 */
import { spawn } from 'node:child_process';

const processes = [
  ['api', 'src/main.ts'],
  ['worker', 'src/worker.ts'],
].map(([name, entry]) => {
  const child = spawn('pnpm', ['exec', 'tsx', 'watch', '--clear-screen=false', entry], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => {
    process.stderr.write(
      `\n${name} exited${code === null ? '' : ` with code ${code}`}; stopping.\n`,
    );
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
