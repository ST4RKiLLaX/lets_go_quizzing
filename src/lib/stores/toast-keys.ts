import { toast } from './toasts';

/**
 * Central map of cross-navigation toast keys. Pages that do a full reload or
 * server redirect (e.g. `window.location.href = '/creator'`) can append
 * `?toast=<key>` to the destination URL; the layout's `afterNavigate` handler
 * consumes the key, fires the matching toast, and strips the param.
 *
 * SPA navigation via `goto(...)` should fire `toast.success(...)` directly
 * instead — in-memory toasts survive SPA transitions.
 */
export const TOAST_KEYS: Record<string, () => void> = {
  'setup-complete': () => toast.success('Setup complete'),
  'creator-login': () => toast.success('Signed in'),
  'host-logged-out': () => toast.info('Signed out'),
  migrated: () => toast.success('Migration complete'),
};
