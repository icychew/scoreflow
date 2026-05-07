"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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
    const { data: existing } = await db
      .from("comp_codes")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
  }
  if (!code) throw new Error("Could not generate a unique code; try again.");

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error } = await db.from("comp_codes").insert({
    code,
    tier: input.tier,
    max_uses: Math.max(1, Math.floor(input.maxUses)),
    expires_at: expiresAt,
    created_by: session.user.id,
    note: input.note?.trim() || null,
  });
  if (error) throw error;

  revalidatePath("/admin/codes");
  return code;
}

export async function revokeCode(code: string) {
  await requireAdmin();

  // Soft revoke by setting expires_at to now — keeps audit history intact.
  const { error } = await db
    .from("comp_codes")
    .update({ expires_at: new Date().toISOString() })
    .eq("code", code);
  if (error) throw error;

  revalidatePath("/admin/codes");
}
