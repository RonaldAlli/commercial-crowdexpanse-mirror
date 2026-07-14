// Pure open-redirect guard. Server actions accept a `redirectTo` from a form, so
// it is untrusted input — an attacker could try to bounce a user to an external
// host. This validates that the value is an INTERNAL, relative application path
// and otherwise returns a safe fallback. No Prisma/framework: unit-testable.

/** True if the string contains any ASCII control character (< 0x20), e.g. CR/LF. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/**
 * Return `raw` only if it is a safe internal path, else `fallback`. Safe means:
 * begins with a single "/", is not protocol-relative ("//"), has no embedded
 * protocol ("://"), no backslashes, and no control characters (CR/LF etc.).
 */
export function safeInternalPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (!raw.startsWith("/")) return fallback; // must be absolute-internal
  if (raw.startsWith("//")) return fallback; // protocol-relative → external host
  if (raw.includes("\\")) return fallback; // backslash tricks (e.g. "/\\evil.com")
  if (raw.includes("://")) return fallback; // defensive: no embedded protocol
  if (hasControlChars(raw)) return fallback; // control chars incl. CR/LF
  return raw;
}
