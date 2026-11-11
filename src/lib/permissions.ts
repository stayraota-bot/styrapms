// Shared (client + server) role model. The database RLS policies are the source of truth;
// this file only decides what the UI offers, and server actions re-check before writing.
export const ROLES = ["super_admin", "admin", "property_manager", "accountant", "operations", "housekeeping", "owner", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", admin: "Admin", property_manager: "Property Manager", accountant: "Accountant",
  operations: "Operations Staff", housekeeping: "Housekeeping Staff", owner: "Property Owner", auditor: "Auditor",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  super_admin: "Full access to everything, including users, sharing percentages and approvals.",
  admin: "Manages assigned properties, bookings, expenses and operations.",
  property_manager: "Bookings, guests, check-ins, expenses and maintenance for assigned properties.",
  accountant: "Income, expenses, bill verification, settlements and owner payments.",
  operations: "Check-in/check-out and operational updates for assigned properties.",
  housekeeping: "Own cleaning tasks and maintenance reports. No financial access.",
  owner: "Read-only portal for their own properties, statements and payments.",
  auditor: "Read-only access to authorised financial records.",
};

const FIN_VIEW: Role[] = ["super_admin", "admin", "property_manager", "accountant", "auditor"];
export const can = {
  viewFinance: (r: Role) => FIN_VIEW.includes(r),
  manageFinance: (r: Role) => ["super_admin", "admin", "accountant"].includes(r),
  addExpense: (r: Role) => ["super_admin", "admin", "property_manager", "accountant"].includes(r),
  addIncome: (r: Role) => ["super_admin", "admin", "property_manager", "accountant"].includes(r),
  approveExpense: (r: Role) => ["super_admin", "accountant"].includes(r),
  recordGuestPayment: (r: Role) => ["super_admin", "admin", "property_manager", "accountant"].includes(r),
  manageBookings: (r: Role) => ["super_admin", "admin", "property_manager", "operations"].includes(r),
  viewBookings: (r: Role) => r !== "housekeeping",
  viewLeads: (r: Role) => ["super_admin", "admin", "property_manager", "operations", "accountant", "auditor"].includes(r),
  manageLeads: (r: Role) => ["super_admin", "admin", "property_manager", "operations"].includes(r),
  manageProperties: (r: Role) => ["super_admin", "admin"].includes(r),
  addProperty: (r: Role) => r === "super_admin",
  manageRooms: (r: Role) => ["super_admin", "admin", "property_manager"].includes(r),
  configureSharing: (r: Role) => r === "super_admin",
  generateSettlement: (r: Role) => ["super_admin", "admin", "accountant"].includes(r),
  approveSettlement: (r: Role) => r === "super_admin",
  recordOwnerPayment: (r: Role) => ["super_admin", "accountant"].includes(r),
  manageUsers: (r: Role) => r === "super_admin",
  manageSettings: (r: Role) => r === "super_admin",
  viewAudit: (r: Role) => ["super_admin", "auditor"].includes(r),
  manageOwners: (r: Role) => ["super_admin", "admin"].includes(r),
  blockDates: (r: Role) => ["super_admin", "admin", "property_manager"].includes(r),
  maintenance: (r: Role) => !["owner", "auditor", "accountant"].includes(r),
  manageMaintenance: (r: Role) => ["super_admin", "admin", "property_manager", "operations"].includes(r),
  housekeeping: (r: Role) => ["super_admin", "admin", "property_manager", "operations", "housekeeping"].includes(r),
  vendors: (r: Role) => ["super_admin", "admin", "property_manager", "accountant", "auditor"].includes(r),
  adjustments: (r: Role) => ["super_admin", "accountant"].includes(r),
};
