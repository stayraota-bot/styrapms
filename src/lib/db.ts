import "server-only";
import postgres from "postgres";
import { env } from "./env";

export type Sql = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;

const g = globalThis as unknown as { __stayraSql?: Sql };

function create(): Sql {
  return postgres(env.databaseUrl, {
    prepare: false, // required for Supabase transaction pooler
    max: process.env.VERCEL ? 3 : 8,
    idle_timeout: 20,
    connect_timeout: 15,
    connection: { TimeZone: "Asia/Kolkata", application_name: "stayra-pms" },
    // Keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting) and numerics as exact strings.
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  }) as unknown as Sql;
}

function getSql(): Sql {
  return g.__stayraSql ?? (g.__stayraSql = create());
}

/** Privileged connection (lazy-initialized so `next build` does not require DATABASE_URL at build time). */
export const sysSql: Sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, thisArg, argArray) {
    return Reflect.apply(getSql() as unknown as (...args: unknown[]) => unknown, thisArg, argArray);
  },
  get(_target, prop) {
    const instance = getSql() as unknown as Record<PropertyKey, unknown>;
    const val = instance[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

/**
 * Run queries as the signed-in user. Switches to the `authenticated` role and sets the JWT
 * claims inside a transaction, so PostgreSQL Row Level Security is enforced on every statement.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sysSql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true),
                    set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  booking_no_overlap: "This room already has a confirmed booking for some of these dates.",
  booking_dates: "Check-out must be after check-in.",
  booking_discount: "Discount cannot be more than the room amount.",
  agreement_pct_total: "STAYRA and owner percentages must add up to 100%.",
  agreement_no_overlap: "Agreement dates overlap an existing agreement.",
  properties_name_uq: "A property with this name already exists.",
  vendors_name_uq: "A vendor with this name already exists.",
  vendors_gstin_uq: "A vendor with this GST number already exists.",
  settlement_items_no_double_count: "Some of these items are already part of another settlement.",
  expense_paid_le_total: "Paid amount cannot exceed the bill total.",
  expense_booking_scope: "Booking-specific expenses must be linked to a booking.",
  block_dates: "End date must be after start date.",
  profiles_email_key: "A user with this email already exists.",
  property_units_property_id_name_key: "A room with this name already exists in the property.",
};

/** Turn database errors into messages a non-technical user understands. */
export function friendlyDbError(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint_name?: string; constraint?: string };
  const constraint = err.constraint_name ?? err.constraint;
  if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint];
  if (err.code === "42501" || /row-level security/i.test(err.message ?? "")) {
    return err.message && !/row-level security|permission denied/i.test(err.message)
      ? err.message
      : "You don't have permission to do this for the selected property.";
  }
  if (err.code === "23505") return "This record already exists (duplicate).";
  if (err.code === "23503") return "A linked record is missing or still in use.";
  if (err.code === "23514") return "Some values are not valid. Please check the form.";
  if (err.code === "P0001" && err.message) return err.message;
  console.error("[db]", e);
  return "Something went wrong while saving. Please try again.";
}
