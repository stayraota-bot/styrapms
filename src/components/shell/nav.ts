import type { Role } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; roles?: Role[]; group?: string };
const STAFF: Role[] = ["super_admin", "admin", "property_manager", "accountant", "operations", "auditor"];
const FIN: Role[] = ["super_admin", "admin", "property_manager", "accountant", "auditor"];

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard", roles: [...STAFF, "housekeeping"] },
  { href: "/leads", label: "Leads / CRM", icon: "Headset", roles: STAFF },
  { href: "/properties", label: "Properties", icon: "Building2", roles: STAFF },
  { href: "/owners", label: "Owners", icon: "UserRound", roles: ["super_admin", "admin", "accountant", "auditor", "property_manager"] },
  { href: "/bookings", label: "Bookings", icon: "BookOpenCheck", roles: STAFF },
  { href: "/calendar", label: "Calendar", icon: "CalendarDays", roles: STAFF },
  { href: "/income", label: "Income", icon: "ArrowDownToLine", roles: FIN, group: "Finance" },
  { href: "/expenses", label: "Expenses", icon: "Receipt", roles: FIN, group: "Finance" },
  { href: "/revenue-sharing", label: "Revenue Sharing", icon: "Percent", roles: ["super_admin", "admin", "accountant", "auditor"], group: "Finance" },
  { href: "/settlements", label: "Owner Settlements", icon: "HandCoins", roles: ["super_admin", "admin", "accountant", "auditor"], group: "Finance" },
  { href: "/reports", label: "Reports", icon: "BarChart3", roles: ["super_admin", "admin", "accountant", "auditor", "property_manager"], group: "Finance" },
  { href: "/vendors", label: "Vendors", icon: "Truck", roles: FIN, group: "Finance" },
  { href: "/maintenance", label: "Maintenance", icon: "Wrench", roles: ["super_admin", "admin", "property_manager", "operations", "housekeeping"], group: "Operations" },
  { href: "/housekeeping", label: "Housekeeping", icon: "Sparkles", roles: ["super_admin", "admin", "property_manager", "operations", "housekeeping"], group: "Operations" },
  { href: "/users", label: "Users", icon: "Users", roles: ["super_admin"], group: "Admin" },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ["super_admin"], group: "Admin" },
  { href: "/audit-logs", label: "Audit Logs", icon: "ScrollText", roles: ["super_admin", "auditor"], group: "Admin" },
];

export const navFor = (role: Role) => NAV.filter((n) => !n.roles || n.roles.includes(role));
