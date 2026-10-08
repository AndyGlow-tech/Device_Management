import type { DeviceCategory } from "@/types/database.types";

const LAPTOP_KEYWORDS = ["thinkpad", "notebook", "macbook", "laptop", "elitebook", "latitude"];
const COMPUTER_KEYWORDS = [
  "imac",
  "mac mini",
  "mac studio",
  "mac pro",
  "mini pc",
  "thinkcentre",
  "optiplex",
  "nucbox",
  "minis forum",
  "all-in-one",
  "all in one",
];
const PHONE_KEYWORDS = ["iphone", "galaxy s", "galaxy z", "pixel", "smartphone"];
const TABLET_KEYWORDS = ["ipad", "tablet", "galaxy tab"];

// Accessories (docks, hubs, cables, mice, ...) often mention "for ... Laptop"
// or a laptop brand/model in their title to describe compatibility, which
// would otherwise false-positive against LAPTOP_KEYWORDS. Checked first so
// any accessory keyword wins regardless of what it says it's compatible with.
const ACCESSORY_KEYWORDS = [
  "hub",
  "dock",
  "docking station",
  "adapter",
  "cable",
  "charger",
  "netzteil",
  "ladegerät",
  "case",
  "hülle",
  "tasche",
  "sleeve",
  "stand",
  "mount",
  "halterung",
  "maus",
  "mouse",
  "trackpad",
];

// Keyboards are accessories too, but laptop listings often mention the
// layout ("QWERTZ Tastatur"). Checked after laptop keywords so a ThinkPad
// stays a laptop; a standalone Magic Keyboard still falls through to Other.
const KEYBOARD_KEYWORDS = ["tastatur", "keyboard"];

export type { DeviceCategory };

export const DEVICE_CATEGORIES: DeviceCategory[] = [
  "laptop",
  "computer",
  "phone",
  "tablet",
  "other",
];

// Keep in sync with public.categorize_device() in
// supabase/migrations/0020_accessory_input_devices.sql.
export function categorizeDevice(deviceName: string): DeviceCategory {
  const name = deviceName.toLowerCase();

  if (ACCESSORY_KEYWORDS.some((kw) => name.includes(kw))) return "other";
  if (LAPTOP_KEYWORDS.some((kw) => name.includes(kw))) return "laptop";
  if (KEYBOARD_KEYWORDS.some((kw) => name.includes(kw))) return "other";
  if (COMPUTER_KEYWORDS.some((kw) => name.includes(kw))) return "computer";
  if (PHONE_KEYWORDS.some((kw) => name.includes(kw))) return "phone";
  if (TABLET_KEYWORDS.some((kw) => name.includes(kw))) return "tablet";

  return "other";
}
