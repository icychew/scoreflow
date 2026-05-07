/**
 * Complimentary tier resolution.
 *
 * Two mechanisms grant Pro/Business tier without payment:
 *
 *  1. Email allowlist (this file) — env-var-driven, evaluated on every sign-in.
 *     Add an email to COMP_PRO_EMAILS or COMP_BUSINESS_EMAILS in Vercel and
 *     redeploy; that user's tier is set on next sign-in. Removing the email
 *     downgrades them on next sign-in.
 *
 *  2. Redemption codes — DB-driven (see comp_codes table + /redeem page).
 *     Codes are persistent: once redeemed, the tier stays even if the code
 *     is later revoked.
 *
 * Resolution order: email allowlist wins over redeemed code (so admin can
 * always force-upgrade a user). Both win over the default `free` tier.
 */

export type Tier = "free" | "pro" | "business";

const ADMIN_EMAILS = parseList(process.env.ADMIN_EMAILS);
const COMP_PRO_EMAILS = parseList(process.env.COMP_PRO_EMAILS);
const COMP_BUSINESS_EMAILS = parseList(process.env.COMP_BUSINESS_EMAILS);

function parseList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Returns the comp tier for an email if listed, otherwise null.
 * Admins are always granted business tier.
 */
export function getCompTier(email: string | null | undefined): Tier | null {
  if (!email) return null;
  const e = email.toLowerCase();
  if (ADMIN_EMAILS.has(e)) return "business";
  if (COMP_BUSINESS_EMAILS.has(e)) return "business";
  if (COMP_PRO_EMAILS.has(e)) return "pro";
  return null;
}

/** True if the email is in ADMIN_EMAILS. Used for /admin/* gates. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}
