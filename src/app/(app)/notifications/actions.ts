"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, type ActionState } from "@/lib/action";
export async function markAllRead(): Promise<ActionState> {
  return attempt(async () => { await db((tx) => tx`update notifications set is_read = true where not is_read`); revalidatePath("/", "layout"); return { message: "All caught up" }; });
}
