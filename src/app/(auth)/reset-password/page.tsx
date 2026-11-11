import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { Input } from "@/components/ui/core";
import { setNewPassword } from "../actions";

export const metadata = { title: "Set new password" };

export default async function ResetPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/forgot-password");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="text-sm text-muted mt-1 mb-8">Signed in as {u.email}. At least 10 characters with a letter and a number.</p>
      <ActionForm action={setNewPassword} className="space-y-4">
        <Field name="password" label="New password"><Input name="password" type="password" autoComplete="new-password" /></Field>
        <Field name="confirm" label="Confirm password"><Input name="confirm" type="password" autoComplete="new-password" /></Field>
        <SubmitButton className="w-full" size="lg">Update password</SubmitButton>
      </ActionForm>
    </div>
  );
}
