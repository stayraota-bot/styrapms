import "server-only";

export type AuthMode = "supabase" | "local";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  get authMode(): AuthMode {
    const m = (process.env.AUTH_MODE ?? "supabase") as AuthMode;
    if (m === "local" && process.env.VERCEL_ENV === "production") {
      throw new Error("AUTH_MODE=local is not allowed in production. Use Supabase Auth.");
    }
    return m;
  },
  get databaseUrl() { return required("DATABASE_URL"); },
  get supabaseUrl() { return required("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseAnonKey() { return required("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get serviceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },
  get authSecret() { return required("AUTH_SECRET"); },
  get appUrl() { return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"; },
};
