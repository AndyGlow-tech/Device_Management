// Grover employee directory -> upsert into the app's `employees` table
// (see supabase/migrations/0008_employees_directory.sql).
//
// What it does: scrapes the employee list on Grover's business dashboard
// (name + email per row) and generates an upsert into `employees`
// (user_name -> user_email). The app resolves a device's owner email from
// this table at display time whenever device_assignments.user_email is
// null, so this never needs to touch device_assignments directly -- no
// more re-running a backfill every time devices get reimported or
// reassigned. Safe to re-run any time (new hires, name changes, etc.);
// each run just refreshes the table with whatever the directory shows now.
//
// Why it auto-scrolls: same virtualized-table situation as the device list
// (grover.js in this folder) -- only ~20 rows exist in the DOM at once, so
// this captures on every scroll tick into a map keyed by employee ID
// (from the profile link's URL, since names alone aren't guaranteed
// unique) and stops once scrolling stops making progress.
//
// How to run: open Grover's employee list page, open DevTools console,
// paste this whole file, press Enter. It downloads sync-employees.sql --
// open that file, paste its contents into the Supabase SQL editor, and run
// it. Nothing else in the schema is touched.
(function () {
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
      const cell = row.querySelector('td[role="cell"]');
      const link = cell?.querySelector('a[href*="/employees/"]');
      const employeeId = link?.getAttribute("href")?.match(/\/employees\/([^/?#]+)/)?.[1] ?? null;
      if (!employeeId || seen.has(employeeId)) continue;

      const name = cell?.querySelector("a span")?.textContent.trim() ?? null;
      const email = cell?.querySelector("p")?.textContent.trim() ?? null;
      if (!name || !email) continue; // need both to be useful for the backfill

      seen.set(employeeId, { name, email });
    }
  }

  function sqlEscape(value) {
    return value.replace(/'/g, "''");
  }

  const scrollTarget = findScrollableElement();
  console.log("Scrolling element:", scrollTarget);

  const seen = new Map();
  captureVisibleRows(seen);

  let lastScrollTop = -1;
  let stableTicks = 0;

  const scrollInterval = setInterval(() => {
    captureVisibleRows(seen);
    scrollTarget.scrollBy(0, 100);

    const scrollUnchanged = scrollTarget.scrollTop === lastScrollTop;
    lastScrollTop = scrollTarget.scrollTop;
    stableTicks = scrollUnchanged ? stableTicks + 1 : 0;

    if (stableTicks >= 10) {
      clearInterval(scrollInterval);
      setTimeout(() => {
        captureVisibleRows(seen);
        const captured = Array.from(seen.values());
        console.log(`Captured ${captured.length} employees with both a name and an email.`);

        // `ON CONFLICT DO UPDATE` can't affect the same target row twice in
        // one statement -- two different Grover profiles sharing a name
        // (the employees table only has room for one row per name) would
        // make the whole insert fail. Keep the first occurrence and warn
        // loudly about the rest, rather than silently dropping a person.
        const byName = new Map();
        const duplicates = [];
        for (const employee of captured) {
          if (byName.has(employee.name)) {
            duplicates.push(employee);
          } else {
            byName.set(employee.name, employee);
          }
        }
        if (duplicates.length > 0) {
          console.log(
            `Found ${duplicates.length} duplicate name(s) -- keeping only the first occurrence of each, skipping the rest:`,
          );
          duplicates.forEach((e) => console.log(`  skipped: ${e.name} <${e.email}>`));
        }
        const employees = Array.from(byName.values());

        const valuesList = employees
          .map((e) => `  ('${sqlEscape(e.name)}', '${sqlEscape(e.email)}')`)
          .join(",\n");

        const sql = `-- Refresh the employees directory (name -> email) from Grover.
-- Only touches user_email/updated_at -- employment_type and active are
-- managed separately and are left untouched by this sync.
insert into employees (user_name, user_email)
values
${valuesList}
on conflict (user_name) do update
set user_email = excluded.user_email,
    updated_at = now();
`;

        console.log(sql);

        const blob = new Blob([sql], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sync-employees.sql";
        a.click();
        URL.revokeObjectURL(url);
      }, 500);
    }
  }, 200);
})();
