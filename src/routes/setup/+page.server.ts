import { redirect } from '@sveltejs/kit';
import { hasValidOperationalConfig } from '$lib/server/config.js';

const RECOVERY_MODE = process.env.RECOVERY_MODE === 'true' || process.env.RECOVERY_MODE === '1';

export function load() {
  if (hasValidOperationalConfig() && !RECOVERY_MODE) {
    throw redirect(303, '/');
  }
  const migrationMode = !hasValidOperationalConfig() && !!process.env.HOST_PASSWORD;
  return {
    recoveryMode: RECOVERY_MODE,
    migrationMode,
  };
}
