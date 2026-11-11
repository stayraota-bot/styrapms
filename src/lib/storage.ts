import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Tx } from "./db";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const LOCAL_DIR = path.join(process.cwd(), ".local-storage");

function admin() {
  // Service-role client: server-side only, used after the app has authorised the user.
  return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });
}

export function isRealFile(v: unknown): v is File {
  return typeof v === "object" && v !== null && "size" in v && (v as File).size > 0 && "arrayBuffer" in v;
}

/** Validate + store a bill/photo/agreement and register it (as the user, under RLS). Returns document id. */
export async function saveUpload(tx: Tx, opts: {
  file: File; entityType: string; entityId?: string | null; propertyId?: string | null; userId: string;
}): Promise<string> {
  const { file } = opts;
  if (file.size > MAX_BYTES) throw Object.assign(new Error("File is larger than 10 MB."), { code: "P0001" });
  if (!ALLOWED.includes(file.type)) throw Object.assign(new Error("Only JPG, PNG, WEBP, HEIC images or PDF files can be uploaded."), { code: "P0001" });
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const key = `${opts.propertyId ?? "general"}/${opts.entityType}/${new Date().getFullYear()}/${randomUUID()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (env.authMode === "local") {
    const full = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
  } else {
    const { error } = await admin().storage.from("documents").upload(key, bytes, { contentType: file.type, upsert: false });
    if (error) throw Object.assign(new Error(`Upload failed: ${error.message}`), { code: "P0001" });
  }
  const [row] = await tx<{ id: string }[]>`
    insert into uploaded_documents(storage_path, file_name, mime_type, size_bytes, entity_type, entity_id, property_id, uploaded_by)
    values (${key}, ${file.name}, ${file.type}, ${file.size}, ${opts.entityType}, ${opts.entityId ?? null}, ${opts.propertyId ?? null}, ${opts.userId})
    returning id`;
  return row.id;
}

/** Read a stored file (the caller must already have confirmed access via an RLS-scoped query). */
export async function readStored(key: string): Promise<{ bytes?: Buffer; signedUrl?: string }> {
  if (env.authMode === "local") return { bytes: await fs.readFile(path.join(LOCAL_DIR, key)) };
  const { data, error } = await admin().storage.from("documents").createSignedUrl(key, 60);
  if (error) throw error;
  return { signedUrl: data.signedUrl };
}

export function supabaseAdmin() { return admin(); }
