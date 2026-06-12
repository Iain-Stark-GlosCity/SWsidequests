import { loadMembers } from './data.js';

/* First-connect registration gate.
   The members store doubles as the user registry: a signed-in account with
   no member profile is a first-time visitor, and gets sent to the welcome
   flow (welcome.html) which creates one. A per-session flag avoids
   re-fetching the member list on every page view once registration is
   confirmed. */

const FLAG_PREFIX = 'sw::registered::';

export function markRegistered(oid) {
  try { sessionStorage.setItem(FLAG_PREFIX + oid, '1'); } catch { /* ignore */ }
}

/* Returns true when the caller should stop rendering because we are
   redirecting to the welcome flow. Fails open when the members API is
   unreachable (e.g. static dev server without the API) so the board
   still loads. */
export async function ensureRegistered(session) {
  if (!session || !session.authenticated) return false;
  try {
    if (sessionStorage.getItem(FLAG_PREFIX + session.oid)) return false;
  } catch { /* ignore */ }

  let members;
  try {
    members = await loadMembers();
  } catch {
    return false;
  }

  if (members.some((m) => m.oid === session.oid)) {
    markRegistered(session.oid);
    return false;
  }

  location.href = 'welcome.html';
  return true;
}
