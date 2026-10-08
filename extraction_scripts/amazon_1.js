// Amazon order history -> devices_management import JSON. Main script --
// run this on every page of order history.
//
// What it does: scrapes each order card on an Amazon order-history page
// (order date, ship-to recipient, and every item in the order, including
// orders with multiple items) into objects shaped for this app's Import
// feature. Cancelled orders, refunds, and completed returns (a Gutschrift:
// "Rücksendung abgeschlossen" / "Deine Gutschrift wurde veranlasst") are
// skipped entirely, since nothing was actually kept. A delivered order
// ("Zugestellt") is kept. Progress is saved to localStorage after
// every page, since Amazon's pagination is a full page reload (which wipes
// any in-memory JS state) -- that's also why this script re-runs itself on
// every page rather than looping in memory. Navigation between pages is
// manual -- this script does not follow "next page" itself.
//
// How to run:
//   1. Before a fresh scrape, clear old progress once:
//        localStorage.removeItem("amazon_order_import_accumulator")
//   2. Go to page 1 of your Amazon order history, open DevTools console,
//      paste this whole file, press Enter. It only logs progress and
//      saves to localStorage -- no file is downloaded yet.
//   3. Click to page 2 yourself, paste the script again -- it merges this
//      page's items into the same accumulator. Repeat for every page.
//   4. Once you've covered every page, run amazon_2.js in this folder --
//      that's the one that downloads the combined amazon-orders.json and
//      clears the saved progress.
//
// Known limitations, by design (see conversation history for the tradeoffs):
//   - serial_number is always null -- Amazon never exposes a device's real
//     serial. amazon_order_number (the real Amazon order ID) is the
//     device's identity instead. Once the same physical device shows up
//     later in a Deeploi/MDM import (with its real serial), the app's
//     "Possible duplicates" view surfaces it as a candidate to merge --
//     matched by device category + current owner, confirmed manually,
//     never automatic. Fill in a real serial directly via the app's "Edit
//     serial number" action once known, if there's no Deeploi match to
//     merge with.
//   - Two genuinely identical items (same name) in the same order aren't
//     distinguishable by amazon_order_number alone -- a rare edge case,
//     accepted rather than adding a second disambiguating field.
//   - owner_name comes from the ship-to recipient, not whoever placed the
//     order (those can be different people -- an admin ordering equipment
//     for someone else, for example).
//   - owner_email is always null -- not present anywhere in Amazon's order
//     data.
//   - ownership_status is always "purchased" (Amazon orders are always a
//     one-time buy, never a rental) and purchase_price is the per-item
//     price shown on the order (not the order's overall total, which can
//     differ when an order has multiple items or a discount applied).
//     monthly_price is always null here -- that's a Grover-only concept.
(function () {
    const MONTHS_DE = {
      jan: "01", januar: "01",
      feb: "02", februar: "02",
      "märz": "03", mär: "03", mrz: "03",
      apr: "04", april: "04",
      mai: "05",
      jun: "06", juni: "06",
      jul: "07", juli: "07",
      aug: "08", august: "08",
      sep: "09", sept: "09", september: "09",
      okt: "10", oktober: "10",
      nov: "11", november: "11",
      dez: "12", dezember: "12",
    };
  
    function parseGermanDate(text) {
      if (!text) return null;
      const match = text.trim().match(/(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?\s*(\d{4})?/);
      if (!match) return null;
      const [, day, monthRaw, yearRaw] = match;
      const month = MONTHS_DE[monthRaw.toLowerCase().replace(".", "")];
      if (!month) return null;
      const year = yearRaw || String(new Date().getFullYear());
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }
  
    function extractAsin(href) {
      if (!href) return null;
      const match = href.match(/\/dp\/([A-Z0-9]+)/);
      return match ? match[1] : null;
    }

    // "€8.8" -> 8.8 (Amazon.de's item price text already uses a period as
    // the decimal separator here, unlike Grover's "66,99 €").
    function parsePrice(text) {
      if (!text) return null;
      const cleaned = text.replace(/[€\s]/g, "");
      const value = Number(cleaned);
      return Number.isNaN(value) ? null : value;
    }
  
    function orderIdFromCard(card) {
      const rawFields = card.querySelector('input[name="aggregatedFields"]')?.value;
      try {
        const aggregated = rawFields ? JSON.parse(rawFields) : {};
        if (aggregated.orderId) return aggregated.orderId;
      } catch {
        // Fall through to the visible order number.
      }
      return card.querySelector('[id="orderIdField"] [dir="auto"]')?.textContent.trim() ?? null;
    }

    const STORAGE_KEY = "amazon_order_import_accumulator";
    const orderCards = Array.from(document.querySelectorAll('[id="orderCard"]'));
    const newDevices = [];
    const skippedOrderIds = new Set();
    let skippedCancelled = 0;
  
    orderCards.forEach((card) => {
      // Status lives in the delivery box's left column: a bold heading
      // ("Zugestellt: 27. August" vs "Rücksendung abgeschlossen") plus the
      // sentence under it. The Gutschrift wording is only in that sentence
      // ("Deine Gutschrift wurde veranlasst"), not the heading, so both
      // have to be read. The item block's "Zeitraum für Rückgabe" return
      // window is outside this column and must not count as a credit.
      const statusColumn = card.querySelector(
        '[id="orderCardDeliveryBox"] .a-column.a-span9',
      );
      const statusText = statusColumn?.textContent.trim().toLowerCase() ?? "";
      if (
        /storniert|cancell?ed|erstattet|erstattung|refunded|gutschrift|r(ü|ue)cksendung/.test(
          statusText,
        )
      ) {
        skippedCancelled += 1;
        const skippedOrderId = orderIdFromCard(card);
        if (skippedOrderId) skippedOrderIds.add(skippedOrderId);
        return;
      }
  
      const rawFields = card.querySelector('input[name="aggregatedFields"]')?.value;
      let aggregated = {};
      try {
        aggregated = rawFields ? JSON.parse(rawFields) : {};
      } catch {
        aggregated = {};
      }
  
      const orderId =
        aggregated.orderId ??
        card.querySelector('[id="orderIdField"] [dir="auto"]')?.textContent.trim() ??
        null;
      const shipToName = aggregated.shipToFullName ?? null;
      const shipToAddress = aggregated.shipToDisplayableAddress?.replace(/<br>/gi, ", ") ?? null;
      const placedByName = aggregated.placedByName ?? null;
      const placedByGroup = aggregated.placedByGroup ?? null;
  
      const header = card.querySelector('[id="orderCardHeader"]');
      const firstColumn = header?.querySelector(".a-column");
      const orderDateRaw = firstColumn?.querySelector(".a-row.a-size-base")?.textContent.trim() ?? null;
      const orderDate = parseGermanDate(orderDateRaw);
  
      const items = Array.from(card.querySelectorAll('[id="itemDetail"]'));
  
      items.forEach((item, index) => {
        const titleLink = item.querySelector(".imageContainer + .a-column a.a-link-normal");
        const deviceName = titleLink?.textContent.trim() ?? null;
        const asin = extractAsin(titleLink?.getAttribute("href"));
        const price = item.querySelector(".a-color-price")?.textContent.trim() ?? null;
  
        // Local bookkeeping key only (order + item position) -- keeps
        // re-scraping the same page from creating duplicate JSON entries
        // even for two identical items in one order. Not sent to the app;
        // the schema-level identity is amazon_order_number + device_name
        // (see import_devices), which can't distinguish that edge case --
        // accepted as documented above.
        newDevices.push({
          _key: orderId ? `${orderId}-${index}` : `no-order-${Math.random()}`,
          serial_number: null,
          device_name: deviceName,
          origin: "amazon",
          order_date: orderDate,
          enrollment_status: null,
          enrolled_at: null,
          owner_name: shipToName,
          owner_email: null,
          assigned_at: orderDate,
          ownership_status: "purchased",
          monthly_price: null,
          purchase_price: parsePrice(price),
          amazon_order_number: orderId,
          amazon_asin: asin,
          amazon_price: price,
          amazon_ship_to_address: shipToAddress,
          amazon_placed_by_name: placedByName,
          amazon_placed_by_group: placedByGroup,
        });
      });
    });

    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const merged = new Map(existing.map((d) => [d._key ?? `no-key-${Math.random()}`, d]));
    // A Gutschrift scraped on an earlier run of this page is already in
    // the accumulator. Drop it now that the card is recognized as a credit.
    let removedCount = 0;
    for (const [key, device] of merged) {
      if (device.amazon_order_number && skippedOrderIds.has(device.amazon_order_number)) {
        merged.delete(key);
        removedCount += 1;
      }
    }
    let addedCount = 0;
    for (const device of newDevices) {
      const key = device._key;
      if (!merged.has(key)) addedCount += 1;
      merged.set(key, device);
    }
    const combined = Array.from(merged.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
  
    console.log(
      `This page: ${newDevices.length} item(s) from ${orderCards.length - skippedCancelled} order(s), skipped ${skippedCancelled} cancelled or credited order(s), removed ${removedCount} previously saved credit(s). New: ${addedCount}. Total accumulated so far: ${combined.length}. Run amazon_2.js when you're done with all pages to download.`,
    );
  })();