import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { Input } from "@/components/ui/core";
import { forgotPassword } from "../actions";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="text-sm text-muted mt-1 mb-8">Enter your login email and we&apos;ll send you a secure reset link.</p>
      <ActionForm action={forgotPassword} className="space-y-4" resetOnSuccess>
        <Field name="email" label="Email"><Input name="email" type="email" autoComplete="username" placeholder="you@stayra.in" /></Field>
        <SubmitButton className="w-full" size="lg" pendingText="Sending…">Send reset link</SubmitButton>
      </ActionForm>
      <p className="text-sm text-center mt-6"><Link href="/login" className="text-brand-700 hover:underline">← Back to sign in</Link></p>
    </div>
  );
}
