import "server-only";
import { z } from "zod";
import { friendlyDbError } from "./db";

export type ActionState = {
  ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; redirectTo?: string; id?: string; at?: number;
};

/** Convert FormData → plain object (multi-value keys become arrays when name ends with []). */
export function formToObject(fd: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k.endsWith("[]")) { const key = k.slice(0, -2); (o[key] = (o[key] as unknown[]) ?? []).push(v); }
    else o[k] = typeof v === "string" ? v.trim() : v;
  }
  return o;
}

export function parse<S extends z.ZodType>(schema: S, fd: FormData):
  { ok: true; data: z.infer<S> } | { ok: false; state: ActionState } {
  const r = schema.safeParse(formToObject(fd));
  if (r.success) return { ok: true, data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of r.error.issues) { const k = String(i.path[0] ?? "form"); fieldErrors[k] ??= i.message; }
  return { ok: false, state: { error: "Please fix the highlighted fields.", fieldErrors, at: Date.now() } };
}

/** Wrap a mutation: returns friendly errors instead of throwing. */
export async function attempt(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try { return { ok: true, at: Date.now(), ...((await fn()) ?? {}) }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e; // redirect()/notFound()
    return { error: friendlyDbError(e), at: Date.now() };
  }
}

// Reusable zod field helpers (forms send strings).
const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);
export const zf = {
  text: (label: string, min = 1) => z.string({ error: `${label} is required` }).trim().min(min, `${label} is required`),
  optText: () => z.preprocess(emptyToUndef, z.string().trim().optional()),
  uuid: (label: string) => z.string({ error: `Select ${label}` }).uuid(`Select ${label}`),
  optUuid: () => z.preprocess(emptyToUndef, z.string().uuid().optional()),
  date: (label: string) => z.string({ error: `${label} is required` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`),
  optDate: () => z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  money: (label: string, { min = 0, positive = false } = {}) =>
    z.preprocess((v) => (v === "" || v === undefined ? (positive ? undefined : 0) : Number(String(v).replace(/[,₹\s]/g, ""))),
      z.number({ error: `${label} must be a number` }).finite()
        .refine((x) => (positive ? x > 0 : x >= min), positive ? `${label} must be more than 0` : `${label} cannot be negative`)
        .refine((x) => Math.round(x * 100) === Math.round(x * 100 * 1) && Number.isInteger(Math.round(x * 100)) && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6, `${label}: max 2 decimals`)),
  int: (label: string, min = 0) => z.preprocess((v) => (v === "" ? undefined : Number(v)), z.number({ error: `${label} is required` }).int().min(min, `${label} must be at least ${min}`)),
  bool: () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  file: () => z.any().optional(),
};
