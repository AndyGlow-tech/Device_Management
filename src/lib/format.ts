import type {
  DeviceCategory,
  DeviceOrigin,
  EmploymentType,
  EnrollmentStatus,
  OwnershipStatus,
} from "@/types/database.types";

export function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// `last_import_at` is a full timestamp (no "Txx:xx:xx" needs adding, unlike
// the date-only fields formatDate handles), so it's parsed directly.
export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// We import weekly, so anything older than ~10 days is flagged as overdue.
const IMPORT_STALE_AFTER_DAYS = 10;

export function formatImportRecency(
  value: string | null,
): { label: string; exact: string; stale: boolean } {
  if (!value) return { label: "Never imported", exact: "—", stale: true };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: "Never imported", exact: "—", stale: true };
  }

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const stale = days > IMPORT_STALE_AFTER_DAYS;

  let label: string;
  if (days <= 0) label = "Today";
  else if (days === 1) label = "1 day ago";
  else if (days < 14) label = `${days} days ago`;
  else label = `${Math.floor(days / 7)} weeks ago`;

  return { label, exact: formatDateTime(value), stale };
}

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  enrolled: "Enrolled",
  not_enrolled: "Not enrolled",
  pending: "Pending",
  removed: "Removed",
  ready_to_enroll: "Ready to enroll",
  pending_enrollment: "Pending enrollment",
  returned: "Returned",
};

export const ENROLLMENT_STATUS_CLASS: Record<EnrollmentStatus, string> = {
  enrolled: "bg-emerald-500/10 text-emerald-300 border-emerald-400/40",
  not_enrolled: "bg-white/5 text-muted border-border",
  pending: "bg-amber-500/10 text-amber-300 border-amber-400/40",
  removed: "bg-red-500/10 text-red-300 border-red-400/40",
  ready_to_enroll: "bg-sky-500/10 text-sky-300 border-sky-400/40",
  pending_enrollment: "bg-orange-500/10 text-orange-300 border-orange-400/40",
  returned: "bg-violet-500/10 text-violet-300 border-violet-400/40",
};

export const DEVICE_ORIGIN_LABEL: Record<DeviceOrigin, string> = {
  amazon: "Amazon",
  apple_store: "Apple Store",
  grover: "Grover",
  topi: "Topi",
  other: "Other",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  employee: "Employee",
  freelancer: "Freelancer",
};

export const OWNERSHIP_STATUS_LABEL: Record<OwnershipStatus, string> = {
  purchased: "Purchased",
  rented: "Rented",
};

export const OWNERSHIP_STATUS_CLASS: Record<OwnershipStatus, string> = {
  purchased: "bg-emerald-500/10 text-emerald-300 border-emerald-400/40",
  rented: "bg-sky-500/10 text-sky-300 border-sky-400/40",
};

export const DEVICE_CATEGORY_LABEL: Record<DeviceCategory, string> = {
  laptop: "Laptop",
  computer: "Computer",
  phone: "Phone",
  tablet: "Tablet",
  other: "Other",
};
