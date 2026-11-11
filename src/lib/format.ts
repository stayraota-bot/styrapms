// Formatting helpers (INR, Indian digit grouping, IST dates).
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0Fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN");

export const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
export const inr = (v: unknown) => inrFmt.format(num(v));
export const inr0 = (v: unknown) => inr0Fmt.format(num(v));
export const n = (v: unknown) => numFmt.format(num(v));
export function inrShort(v: unknown) {
  const x = num(v); const a = Math.abs(x);
  if (a >= 1e7) return `₹${(x / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(x / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `₹${(x / 1e3).toFixed(1)}K`;
  return inr0(x);
}
export const pct = (v: unknown, d = 0) => `${num(v).toFixed(d)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 'YYYY-MM-DD' (or Date) → '05 Jan 2026' without timezone drift. */
export function fdate(v: string | Date | null | undefined, withYear = true) {
  if (!v) return "—";
  const s = typeof v === "string" ? v.slice(0, 10) : istDate(v);
  const [y, m, d] = s.split("-");
  return `${d} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y}` : ""}`;
}
export function fdatetime(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}
/** Date → 'YYYY-MM-DD' in Asia/Kolkata. */
export function istDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const todayIST = () => istDate(new Date());
export function addDays(s: string, days: number) {
  const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
export function monthBounds(s: string) {
  const [y, m] = s.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}
export const titleCase = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bOta\b/, "OTA").replace(/\bCom\b/, "com");

export const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct", airbnb: "Airbnb", booking_com: "Booking.com", makemytrip: "MakeMyTrip", goibibo: "Goibibo", agoda: "Agoda",
  expedia: "Expedia", walk_in: "Walk-in", travel_agent: "Travel Agent", corporate: "Corporate", other: "Other",
};

export const LEAD_SOURCE_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", phone_call: "Phone Call", instagram: "Instagram", facebook: "Facebook Ads",
  website: "Website", google: "Google / GMB", airbnb_inquiry: "Airbnb Inquiry", makemytrip_inquiry: "MakeMyTrip Inquiry",
  referral: "Guest Referral", repeat_guest: "Repeat Guest", travel_agent: "Travel Agent", walk_in: "Walk-in", other: "Other",
};

export const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "New Inquiry", contacted: "Contacted", quoted: "Quote Sent",
  follow_up: "Follow-up", negotiation: "Negotiation", won: "Won / Booked", lost: "Lost",
};

export const LEAD_TEMP_LABEL: Record<string, string> = {
  hot: "Hot 🔥", warm: "Warm", cold: "Cold",
};

export const LEAD_ACTIVITY_LABEL: Record<string, string> = {
  note: "Note", call: "Phone Call", whatsapp: "WhatsApp", email: "Email",
  quote_sent: "Quote Sent", status_change: "Status Updated", reminder_set: "Reminder Scheduled", converted: "Converted to Booking",
};
