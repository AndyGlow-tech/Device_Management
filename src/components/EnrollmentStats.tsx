"use client";

import { useMemo } from "react";
import { DEVICE_CATEGORY_LABEL } from "@/lib/format";
import type { Device, DeviceCategory } from "@/types/database.types";

const CATEGORIES: DeviceCategory[] = ["laptop", "computer", "phone", "tablet", "other"];

export function EnrollmentStats({ devices }: { devices: Device[] }) {
  const stats = useMemo(() => {
    return CATEGORIES.map((category) => {
      const eligible = devices.filter((device) => device.category === category);
      const enrolled = eligible.filter(
        (device) => device.enrollment_status === "enrolled",
      );
      const rate =
        eligible.length > 0
          ? Math.round((enrolled.length / eligible.length) * 100)
          : 0;
      return { category, total: eligible.length, enrolled: enrolled.length, rate };
    });
  }, [devices]);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat) => (
        <div key={stat.category} className="glow-sm border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wider text-muted">
            {DEVICE_CATEGORY_LABEL[stat.category]}s enrolled in deeploi
          </div>
          <div className="mt-1 text-3xl font-semibold text-accent">
            {stat.enrolled}/{stat.total}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden bg-border/40">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${stat.rate}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-muted">{stat.rate}% enrolled</div>
        </div>
      ))}
    </div>
  );
}
