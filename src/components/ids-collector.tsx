"use client";
import { useEffect } from "react";
/** Copies ticked checkboxes (name=ids, form=sourceForm) into another form when it submits. */
export function IdsCollector({ formId, sourceForm }: { formId: string; sourceForm: string }) {
  useEffect(() => {
    const f = document.getElementById(formId);
    const h = (e: Event) => document.querySelectorAll<HTMLInputElement>(`input[name=ids][form=${sourceForm}]:checked`).forEach((c) => (e as FormDataEvent).formData.append("ids", c.value));
    f?.addEventListener("formdata", h);
    return () => f?.removeEventListener("formdata", h);
  }, [formId, sourceForm]);
  return null;
}
