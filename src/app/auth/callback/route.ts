import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/auth/session";

// Handles Supabase email links (password recovery & invitations).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
