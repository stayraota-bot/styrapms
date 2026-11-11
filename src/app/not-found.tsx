import Link from "next/link";
export default function NotFound() {
  return <div className="min-h-dvh grid place-items-center text-center p-6"><div><p className="text-5xl font-semibold text-brand-800">404</p><p className="mt-2 text-muted">This page doesn&apos;t exist or you don&apos;t have access to it.</p><Link href="/" className="inline-block mt-6 text-brand-700 underline">Back to dashboard</Link></div></div>;
}
