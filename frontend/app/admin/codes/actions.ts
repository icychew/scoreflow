"use server";

import { revalidatePath } from "next/cache";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";
import { generateCode, requireAdmin } from "@/lib/admin";

interface CreateCodeInput {
  tier: "pro" | "business";
  maxUses: number;
  expiresInDays?: number | null;
  note?: string;
}

export async function createCode(input: CreateCodeInput) {
  const session = await requireAdmin();

  // Generate up to 5 retries on collision (extremely unlikely with 8-char tail)
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = generateCode(input.tier === "business" ? "BIZ" : "PRO");
    const existing = await convex.query(api.compCodes.getByCode, {
      secret: CONVEX_SECRET,
      code,
    });
    if (!existing) break;
  }
  if (!code) throw new Error("Could not generate a unique code; try again.");

  const expiresAt = input.expiresInDays
    ? Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000
    : undefined;

  await convex.mutation(api.compCodes.create, {
    secret: CONVEX_SECRET,
    code,
    tier: input.tier,
    maxUses: Math.max(1, Math.floor(input.maxUses)),
    expiresAt,
    createdBy: session.user.id,
    note: input.note?.trim() || undefined,
  });

  revalidatePath("/admin/codes");
  return code;
}

export async function revokeCode(code: string) {
  await requireAdmin();

  // Soft revoke by setting expires_at to now — keeps audit history intact.
  await convex.mutation(api.compCodes.setExpiresAt, {
    secret: CONVEX_SECRET,
    code,
    expiresAt: Date.now(),
  });

  revalidatePath("/admin/codes");
}
