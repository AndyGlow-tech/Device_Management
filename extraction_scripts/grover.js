// Grover business dashboard -> devices_management import JSON.
//
// What it does: scrapes the device/employee assignment table on Grover's
// business dashboard (the asset list showing device, serial, current
// employee, rental status, price, dates, category, brand) into an array of
// objects shaped for this app's Import feature, then downloads it as
// grover-devices.json.
//
// Why it auto-scrolls: the table is virtualized -- only ~20 rows exist in
// the DOM at once, and rows get unmounted as you scroll past them. This
// script captures whatever's visible on every scroll tick into a map keyed
// by serial number, so nothing is lost as rows come and go. It stops once
// scrolling stops making progress (~2s with no change) and downloads.
//
// How to run: open the Grover business dashboard's asset list page, open
// the browser console (DevTools), paste this whole file, press Enter.
// Watch the console for "Captured N devices." when it finishes.
//
// Output fields: serial_number, device_name, origin ("grover"), order_date,
// owner_name, and assigned_at map directly to the app's schema. owner_email
// is always null -- Grover's dashboard doesn't expose it; you'll need to
// backfill it separately (e.g. from an employee directory) if you want it.
// ownership_status is derived from Grover's rental-status text
// ("rented"/"purchased", see mapOwnershipStatus below -- only "Miete
// läuft" -> "rented" is confirmed, everything else is a substring
// heuristic), and monthly_price is only set when ownership_status is
// "rented" (a purchased device doesn't have a recurring cost). Everything
// prefixed grover_ (contract number, raw rental status text, price, term
// end, duration, category, brand) is extra reference data the Import
// feature ignores.
//
// Caveat: column extraction is by cell position (cells[0], cells[1], ...),
// inferred from the table's layout at the time this was written. If Grover
// reorders or adds columns, the index mapping below will need updating.
(function () {
    const MONTHS_DE = {
      jan: "01", feb: "02", "märz": "03", mär: "03", apr: "04",
      mai: "05", juni: "06", jun: "06", juli: "07", jul: "07",
      aug: "08", sept: "09", sep: "09", okt: "10", nov: "11", dez: "12",
    };
  
    function parseGermanDate(text) {
      if (!text) return null;
      const match = text.trim().match(/(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?\s*(\d{4})/);
      if (!match) return null;
      const [, day, monthRaw, year] = match;
      const month = MONTHS_DE[monthRaw.toLowerCase().replace(".", "")];
      if (!month) return null;
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }

    // "66,99 €" -> 66.99
    function parseGermanPrice(text) {
      if (!text) return null;
      const cleaned = text.replace(/[€\s]/g, "").replace(",", ".");
      const value = Number(cleaned);
      return Number.isNaN(value) ? null : value;
    }

    // Only "Miete läuft" has been confirmed so far. This falls back to a
    // substring heuristic (kauf/miete) for any other Grover status text so
    // it degrades gracefully instead of only recognizing one exact string
    // -- but that also means it's a guess for anything we haven't seen. If
    // this logs a warning for a status you know the meaning of, that's the
    // signal to hardcode it above instead of relying on the heuristic.
    function mapOwnershipStatus(text) {
      if (!text) return null;
      const normalized = text.toLowerCase();
      if (normalized.includes("miete")) return "rented";
      if (normalized.includes("kauf")) return "purchased";
      console.warn(`Unrecognized Grover rental status "${text}" -- leaving ownership_status unset.`);
      return null;
    }
  
    // Find the actual scrollable container
    function findScrollableElement() {
      const all = document.querySelectorAll("*");
      for (const el of all) {
        if (
          el.scrollHeight > el.clientHeight &&
          getComputedStyle(el).overflowY.match(/(auto|scroll)/)
        ) {
          return el;
        }
      }
      return document.scrollingElement || document.documentElement;
    }
  
    function captureVisibleRows(seen) {
      const rows = Array.from(document.querySelectorAll('tr[role="row"]')).filter((row) =>
        row.querySelector('td[role="cell"]'),
      );
  
      for (const row of rows) {
        const cells = row.querySelectorAll('td[role="cell"]');
        const rawSerial = cells[1]?.textContent.trim() ?? null;
        if (!rawSerial) continue;
        // Grover always prefixes the real hardware serial with a leading
        // "S" in its own UI; other sources (Windows/MDM enrollment
        // exports) report the bare serial. Strip it so the same physical
        // device matches up to one row across every source.
        const serialNumber = /^S/i.test(rawSerial) ? rawSerial.slice(1) : rawSerial;
        if (seen.has(serialNumber)) continue; // already captured

        const orderDateRaw = cells[6]?.textContent.trim() ?? null;
        const rentalStatusRaw = cells[4]?.textContent.trim() ?? null;
        const monthlyPriceRaw = cells[5]?.textContent.trim() ?? null;
        const ownershipStatus = mapOwnershipStatus(rentalStatusRaw);
        seen.set(serialNumber, {
          serial_number: serialNumber,
          device_name: cells[0]?.querySelector("a")?.textContent.trim() ?? null,
          origin: "grover",
          order_date: parseGermanDate(orderDateRaw),
          enrollment_status: null,
          enrolled_at: null,
          owner_name: cells[2]?.querySelector("a span")?.textContent.trim() ?? null,
          owner_email: null,
          assigned_at: parseGermanDate(orderDateRaw),
          ownership_status: ownershipStatus,
          monthly_price: ownershipStatus === "rented" ? parseGermanPrice(monthlyPriceRaw) : null,
          purchase_price: null,
          grover_employee_url: cells[2]?.querySelector('a[href*="/employees/"]')?.getAttribute("href") ?? null,
          grover_contract_number: cells[3]?.textContent.trim() ?? null,
          grover_rental_status: rentalStatusRaw,
          grover_monthly_price: monthlyPriceRaw,
          grover_minimum_term_end: parseGermanDate(cells[7]?.textContent.trim()),
          grover_contract_duration: cells[8]?.textContent.trim() ?? null,
          grover_category: cells[9]?.textContent.trim() ?? null,
          grover_brand: cells[10]?.textContent.trim() ?? null,
        });
      }
    }
  
    function downloadJson(devices) {
      const json = JSON.stringify(devices, null, 2);
      console.log(json);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "grover-devices.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  
    const scrollTarget = findScrollableElement();
    console.log("Scrolling element:", scrollTarget);
  
    const seen = new Map();
    captureVisibleRows(seen); // grab whatever's already loaded before we start
  
    let lastScrollTop = -1;
    let stableTicks = 0;
  
    const scrollInterval = setInterval(() => {
      captureVisibleRows(seen);
      scrollTarget.scrollBy(0, 100);
  
      const scrollUnchanged = scrollTarget.scrollTop === lastScrollTop;
      lastScrollTop = scrollTarget.scrollTop;
      stableTicks = scrollUnchanged ? stableTicks + 1 : 0;
  
      // Stop once scrolling stops making progress (bottom reached and no
      // more lazy-loaded rows are arriving) for ~2 seconds straight.
      if (stableTicks >= 10) {
        clearInterval(scrollInterval);
        setTimeout(() => {
          captureVisibleRows(seen); // one last capture in case of a final async load
          const devices = Array.from(seen.values());
          console.log(`Captured ${devices.length} devices.`);
          downloadJson(devices);
        }, 500);
      }
    }, 200);
  })();