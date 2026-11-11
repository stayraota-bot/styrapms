import { Building2, ShieldCheck, PieChart } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-brand-900 text-white p-12 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-700/40" />
        <div className="absolute -left-10 bottom-10 size-72 rounded-full bg-sand-400/10" />
        <div className="relative"><p className="text-2xl font-bold tracking-[0.2em]">STAYRA</p><p className="text-brand-200 text-sm mt-1">Property Management System</p></div>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Every property, booking and rupee — in one place.</h2>
          <ul className="space-y-4 text-brand-100 text-sm">
            <li className="flex gap-3"><Building2 className="size-5 text-sand-400 shrink-0" />Bookings, calendars and operations across all properties.</li>
            <li className="flex gap-3"><PieChart className="size-5 text-sand-400 shrink-0" />Automatic revenue sharing and owner settlements.</li>
            <li className="flex gap-3"><ShieldCheck className="size-5 text-sand-400 shrink-0" />Role-based access enforced in the database.</li>
          </ul>
        </div>
        <p className="relative text-xs text-brand-300">© {new Date().getFullYear()} STAYRA Hospitality</p>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10 bg-canvas">
        <div className="w-full max-w-sm">
          <p className="lg:hidden text-xl font-bold tracking-[0.2em] text-brand-800 mb-8 text-center">STAYRA</p>
          {children}
        </div>
      </main>
    </div>
  );
}
