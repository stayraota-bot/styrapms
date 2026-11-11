import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { readStored } from "@/lib/storage";

// Serves an uploaded document only if the signed-in user can see it under RLS.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const [doc] = await withUser(user.id, (tx) => tx<{ storage_path: string; mime_type: string; file_name: string }[]>`
    select storage_path, mime_type, file_name from uploaded_documents where id = ${id}`);
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const f = await readStored(doc.storage_path);
  if (f.signedUrl) return NextResponse.redirect(f.signedUrl);
  return new NextResponse(new Uint8Array(f.bytes!), {
    headers: { "Content-Type": doc.mime_type || "application/octet-stream", "Content-Disposition": `inline; filename="${doc.file_name.replace(/"/g, "")}"`, "Cache-Control": "private, max-age=300" },
  });
}
