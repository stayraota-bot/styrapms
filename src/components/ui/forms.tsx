"use client";
import * as React from "react";
import { useActionState, useEffect, useRef, createContext, useContext } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button, cn, Label, type ButtonProps } from "./core";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; redirectTo?: string; at?: number };
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const ErrorsCtx = createContext<Record<string, string> | undefined>(undefined);
const ModalCtx = createContext<{ close: () => void } | null>(null);

export function ActionForm({ action, children, className, resetOnSuccess, successMessage, onSuccess, id }: {
  action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; successMessage?: string; onSuccess?: () => void; id?: string;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  const router = useRouter();
  const modal = useContext(ModalCtx);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) {
      toast.success(state.message ?? successMessage ?? "Saved");
      if (resetOnSuccess) ref.current?.reset();
      modal?.close();
      onSuccess?.();
      if (state.redirectTo) router.push(state.redirectTo); else router.refresh();
    } else if (state.error) toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  return (
    <ErrorsCtx.Provider value={state.fieldErrors}>
      <form ref={ref} action={formAction} className={className} id={id} noValidate>
        {state.error && !state.ok && <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">{state.error}</p>}
        {children}
      </form>
    </ErrorsCtx.Provider>
  );
}

export function Field({ name, label, required, hint, children, className }: {
  name: string; label?: React.ReactNode; required?: boolean; hint?: React.ReactNode; children: React.ReactElement<{ "aria-invalid"?: boolean; id?: string }>; className?: string;
}) {
  const errors = useContext(ErrorsCtx);
  const err = errors?.[name];
  const id = `f-${name}`;
  const canClone = React.isValidElement(children) && !!(children as { props?: unknown }).props;
  return (
    <div className={className}>
      {label && <Label htmlFor={canClone ? id : undefined} required={required}>{label}</Label>}
      {/* Server-rendered children can arrive as lazy references (no props) in production: only clone real elements. */}
      <div data-invalid={!!err} className="[&[data-invalid=true]_:is(input,select,textarea)]:border-red-400">
        {canClone ? React.cloneElement(children, { "aria-invalid": !!err, id: children.props.id ?? id }) : children}
      </div>
      {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, pendingText = "Saving…", ...p }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || p.disabled} {...p}>{pending ? <><Loader2 className="animate-spin" />{pendingText}</> : children}</Button>;
}

export function Modal({ trigger, title, description, children, wide, defaultOpen }: { trigger: React.ReactNode; title: string; description?: string; children: React.ReactNode; wide?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>{trigger}</D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <D.Content className={cn("fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-24px)] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl bg-white shadow-pop border border-line p-5 sm:p-6", wide ? "max-w-2xl" : "max-w-lg")}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div><D.Title className="text-lg font-semibold">{title}</D.Title>
              {description ? <D.Description className="text-sm text-muted mt-0.5">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}</div>
            <D.Close className="rounded-md p-1 text-muted hover:bg-gray-100" aria-label="Close"><X className="size-4" /></D.Close>
          </div>
          <ModalCtx.Provider value={{ close: () => setOpen(false) }}>{children}</ModalCtx.Provider>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** A button that runs a server action after confirmation (optionally asking for a reason). */
export function ConfirmAction({ action, label, title, description, confirmLabel = "Confirm", variant = "secondary", size = "sm", hidden, reason, icon }: {
  action: Action; label: React.ReactNode; title: string; description?: string; confirmLabel?: string;
  variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; hidden?: Record<string, string>; reason?: string; icon?: React.ReactNode;
}) {
  return (
    <Modal title={title} description={description} trigger={<Button type="button" variant={variant} size={size}>{icon}{label}</Button>}>
      <ActionForm action={action}>
        {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {reason && <Field name="reason" label={reason} required><textarea name="reason" rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm" /></Field>}
        <div className="flex justify-end gap-2 mt-5">
          <D.Close asChild><Button type="button" variant="secondary">Cancel</Button></D.Close>
          <SubmitButton variant={variant === "danger" || variant === "outlineDanger" ? "danger" : "primary"}>{confirmLabel}</SubmitButton>
        </div>
      </ActionForm>
    </Modal>
  );
}

export function ModalClose({ children }: { children: React.ReactNode }) { return <D.Close asChild>{children}</D.Close>; }

/** Submit the enclosing GET filter form whenever a control changes. */
export function AutoSubmit({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return <form ref={ref} className={className} onChange={(e) => { if ((e.target as HTMLElement).tagName !== "INPUT" || (e.target as unknown as HTMLInputElement).type !== "search") ref.current?.requestSubmit(); }}>{children}</form>;
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-5 mt-6 border-t border-line">{children}</div>;
}
