import { ENROLLMENT_STATUS_CLASS, ENROLLMENT_STATUS_LABEL } from "@/lib/format";
import type { EnrollmentStatus } from "@/types/database.types";

export function StatusBadge({ status }: { status: EnrollmentStatus }) {
  return (
    <span
      className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-medium ${ENROLLMENT_STATUS_CLASS[status]}`}
    >
      {ENROLLMENT_STATUS_LABEL[status]}
    </span>
  );
}
