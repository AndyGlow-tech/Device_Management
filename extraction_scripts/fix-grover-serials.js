// One-off fixup for Grover export JSON files scraped BEFORE grover.js was
// updated to strip the leading "S" itself. Takes a JSON file in the same
// shape grover.js downloads (array of device objects) and rewrites
// serial_number, stripping a leading S/s where present, leaving entries
// that don't have one untouched (not every device has the prefix).
//
// Usage:
//   node extraction_scripts/fix-grover-serials.js "/path/to/grover-devices.json"
//   node extraction_scripts/fix-grover-serials.js "/path/to/grover-devices.json" "/path/to/output.json"
//
// If no output path is given, writes alongside the input as
// "<name>-fixed.json".

const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node fix-grover-serials.js <input.json> [output.json]");
  process.exit(1);
}

const outputPath =
  process.argv[3] ??
  path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}-fixed${path.extname(inputPath)}`,
  );

const devices = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(devices)) {
  console.error("Expected a JSON array of device objects.");
  process.exit(1);
}

let strippedCount = 0;
const fixed = devices.map((device) => {
  const serial = device.serial_number;
  if (typeof serial === "string" && /^s/i.test(serial)) {
    strippedCount += 1;
    return { ...device, serial_number: serial.slice(1) };
  }
  return device;
});

fs.writeFileSync(outputPath, JSON.stringify(fixed, null, 2));
console.log(
  `Processed ${fixed.length} entries, stripped a leading S from ${strippedCount}. Wrote ${outputPath}`,
);
