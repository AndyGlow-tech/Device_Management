// Manual/fallback companion to amazon_1.js.
//
// What it does: reads whatever's currently saved in localStorage (from
// running amazon_1.js on every page of order history), strips the
// internal `_key` bookkeeping field amazon_1.js uses for deduping,
// downloads the result as amazon-orders.json, and clears the saved
// progress.
//
// When to use it: run this once, after amazon_1.js has been run on every
// page of order history.
//
// Must be run on the same Amazon domain (e.g. amazon.de) you scraped on --
// localStorage is per-origin, so running it elsewhere reads nothing.
(function () {
    const STORAGE_KEY = "amazon_order_import_accumulator";
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const combined = stored.map(({ _key, ...device }) => device);
    const json = JSON.stringify(combined, null, 2);
    console.log(`Downloading ${combined.length} total item(s).`);
  
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "amazon-orders.json";
    a.click();
    URL.revokeObjectURL(url);
  
    localStorage.removeItem(STORAGE_KEY); // reset the accumulator for next time
  })();