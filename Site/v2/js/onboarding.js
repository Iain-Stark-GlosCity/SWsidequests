import { saveMember } from './data.js';

/* First-connect registration. The members store doubles as the user
   registry: a signed-in account with no member record gets one created
   silently — a blank guild card. No setup flow; the board invites the
   user to complete their card when they're ready.

   A per-session flag stops us retrying the create on every refresh if
   the first attempt failed. */

const FLAG_PREFIX = 'sw::registered::';

export function markRegistered(oid) {
  try { sessionStorage.setItem(FLAG_PREFIX + oid, '1'); } catch { /* ignore */ }
}

function alreadyTried(oid) {
  try { return Boolean(sessionStorage.getItem(FLAG_PREFIX + oid)); } catch { return false; }
}

/* Returns the caller's member record, creating a blank one on first
   connect. `members` is the already-loaded member list; a newly created
   record is appended to it. Returns null if creation isn't possible. */
export async function ensureMember(session, members) {
  if (!session || !session.authenticated || !Array.isArray(members)) return null;

  const existing = members.find((m) => m.oid === session.oid);
  if (existing) {
    markRegistered(session.oid);
    return existing;
  }

  if (alreadyTried(session.oid)) return null;
  markRegistered(session.oid);

  const member = {
    oid: session.oid,
    name: session.name || 'New member',
    email: session.email || undefined,
    skills: {},
    fun_facts: [],
    joined_at: new Date().toISOString(),
  };
  try {
    await saveMember(member);
  } catch {
    return null;
  }
  members.push(member);
  return member;
}
