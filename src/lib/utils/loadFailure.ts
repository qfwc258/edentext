import { t } from '../i18n/i18n.svelte';

// One report for every asset the app fetches after start-up. The reason belongs in
// the message: a failure on someone else's browser is otherwise unreportable, and a
// lazy chunk a script blocker ate says so in plain words.
export function reportLoadFailure(what: string, err: unknown): void {
  const detail = (err as Error)?.message ?? String(err);
  const blocked = /dynamically imported module|Importing a module script failed/i.test(detail);
  alert(`${what}\n\n${blocked ? t().dialogs.scriptBlocked : detail}`);
}
