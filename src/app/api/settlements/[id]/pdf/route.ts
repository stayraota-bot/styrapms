import { NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { loadSettlement } from "@/server/settlements";
import { StatementPDF } from "@/server/statement-pdf";

export const runtime = "nodejs";

// RLS decides visibility: owners only get their own approved statements.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const d = await withUser(user.id, (tx) => loadSettlement(tx, id));
  if (!d) return new NextResponse("Not found", { status: 404 });
  const buf = await renderToBuffer(createElement(StatementPDF, { d }) as unknown as React.ReactElement<DocumentProps>);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${d.s.settlement_code}-${d.s.prop.replace(/\W+/g, "-")}-${d.s.period_end}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
