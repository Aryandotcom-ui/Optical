/**
 * Runs once when the Next.js server starts. The Node-only work lives in a
 * separate module so the Edge bundle never sees `process.exit`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnvOnStartup } = await import('./instrumentation-node');
    validateEnvOnStartup();
  }
}
