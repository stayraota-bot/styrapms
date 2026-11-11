"use client";
import { Button } from "@/components/ui/core";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="text-sm text-muted mt-2">{process.env.NODE_ENV === "development" ? error.message : "The page could not be loaded. Please try again."}</p>
      {error.digest && <p className="text-xs text-muted mt-2">Reference: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
