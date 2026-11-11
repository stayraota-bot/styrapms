import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { Input } from "@/components/ui/core";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getCurrentUser();
  if (u) redirect(u.role === "owner" ? "/owner" : "/");
  const { next } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted mt-1 mb-8">Sign in with the login ID given to you by STAYRA.</p>
      <ActionForm action={login} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field name="email" label="Email"><Input name="email" type="email" autoComplete="username" required placeholder="you@stayra.in" /></Field>
        <Field name="password" label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <div className="flex justify-end -mt-1"><Link href="/forgot-password" className="text-xs text-brand-700 hover:underline">Forgot password?</Link></div>
        <SubmitButton className="w-full" size="lg" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="text-xs text-muted mt-8 text-center">Access is by invitation only. Your activity is logged.</p>
    </div>
  );
}
