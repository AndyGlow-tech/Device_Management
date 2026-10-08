import type { Device } from "@/types/database.types";

// `last_import_source` is free text typed into the Import modal (e.g.
// "Amazon", "Deeploi MDM export"), not a fixed enum -- matched by a
// case-insensitive substring so minor variations still count.
function matchesSource(deviceSource: string | null, target: string): boolean {
  if (!deviceSource) return false;
  return deviceSource.toLowerCase().includes(target);
}

export type LastImports = {
  amazon: string | null;
  grover: string | null;
  deeploi: string | null;
};

export function latestImportsBySource(devices: Device[]): LastImports {
  const sources = ["amazon", "grover", "deeploi"] as const;
  const result: LastImports = { amazon: null, grover: null, deeploi: null };

  for (const key of sources) {
    let latest: string | null = null;
    for (const device of devices) {
      if (!device.last_import_at || !matchesSource(device.last_import_source, key)) {
        continue;
      }
      if (!latest || device.last_import_at > latest) latest = device.last_import_at;
    }
    result[key] = latest;
  }

  return result;
}
