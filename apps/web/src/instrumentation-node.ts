import { EnvValidationError } from '@optical/config/env';
import { getEnv } from './env';

/**
 * Validates the environment at boot so a misconfigured deployment fails
 * immediately with a readable message instead of on the first request.
 */
export function validateEnvOnStartup(): void {
  try {
    getEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`\n${error.message}\n\n`);
      process.exit(1);
    }
    throw error;
  }
}
