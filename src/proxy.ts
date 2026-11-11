import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/login", "/forgot-password", "/auth/callback", "/api/cron"];

// Fast gate + Supabase session refresh. Real authorisation happens server-side and in PostgreSQL RLS.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  let res = NextResponse.next({ request: req });
  let signedIn = false;

  if ((process.env.AUTH_MODE ?? "supabase") === "local") {
    signedIn = !!req.cookies.get("stayra_session")?.value;
  } else {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  }
  if (!signedIn && !isPublic) {
    const to = new URL("/login", req.url);
    if (pathname !== "/") to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)"] };
