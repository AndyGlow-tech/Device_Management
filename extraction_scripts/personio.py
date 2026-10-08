#!/usr/bin/env python3
"""Personio employee directory -> JSON.

What it does: authenticates against Personio's Personnel Data API (v1) and
paginates through every employee, keeping first/last name, employment
status, employment type, and work email. Writes personio-employees.json
(or a path you pass) — same extract-then-download idea as the other
scripts in this folder, just against a real API instead of a scraped UI.

How to get credentials:
  1. In Personio: Marketplace > Connected integrations > Create custom
     integration.
  2. Grant Employees (read) and whitelist these Readable employee
     attributes: first_name, last_name, email, status, employment_type.
  3. Copy the client id / secret.

How to run:
  PERSONIO_CLIENT_ID=... PERSONIO_CLIENT_SECRET=... \\
    python extraction_scripts/personio.py

  Optional output path:
    python extraction_scripts/personio.py /path/to/personio-employees.json

Output shape matches the app's `employees` table directly (see
supabase/migrations/0008_employees_directory.sql):
  user_name        first_name + last_name
  user_email       email                (Personio's work-mail field)
  employment_type  "employee" if Personio's employment_type is "internal",
                   "freelancer" if "external", otherwise left null (with a
                   warning) -- Personio's own vocabulary doesn't match our
                   enum, so this is a real value translation, not just a
                   renamed key.
  active           true unless Personio's status is "inactive" (i.e.
                   active/onboarding/leave all count as still active; only
                   "inactive" means they've actually left)
  personio_id      kept as a reference field, not part of the app schema

Also writes a ready-to-run sync SQL file (same path with a .sql extension,
e.g. personio-employees.sql) -- an upsert into the `employees` table,
matched by user_name. Personio is treated as the authoritative HR source,
so this updates user_email too, not just employment_type/active -- if it
ever disagrees with a Grover employee sync for the same person, whichever
one you run last wins. Nothing is written to the database directly; paste
the generated SQL into the Supabase SQL editor and run it yourself.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from dotenv import load_dotenv

## load env variables
load_dotenv()
API_BASE = "https://api.personio.de/v1"
PAGE_SIZE = 100  # Personio's current max for GET /company/employees
MAX_RETRIES = 5
ATTRIBUTES = (
    "first_name",
    "last_name",
    "email",
    "status",
    "employment_type",
)

# Personio's own vocabulary -> the app's employment_type enum.
EMPLOYMENT_TYPE_MAP = {
    "internal": "employee",
    "external": "freelancer",
}

# Personio statuses that should NOT count as active. Everything else
# (active, onboarding, leave) still has the person on the books.
INACTIVE_STATUSES = {"inactive"}


def attr_value(attributes: dict[str, Any], key: str) -> Any:
    field = attributes.get(key)
    if not isinstance(field, dict):
        return None
    return field.get("value")


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code == 429 and attempt < MAX_RETRIES:
                retry_after = error.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else 1.0 * attempt
                print(f"Rate limited (429); retrying in {wait:.0f}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            detail = error.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Personio {method} {url} failed ({error.code}): {detail}") from error
        except urllib.error.URLError as error:
            raise SystemExit(f"Personio {method} {url} failed: {error.reason}") from error

        if isinstance(payload, dict) and payload.get("success") is False:
            raise SystemExit(f"Personio {method} {url} returned success=false: {payload}")
        return payload

    raise SystemExit(f"Personio {method} {url} failed after retries: {last_error}")


def authenticate(client_id: str, client_secret: str) -> str:
    payload = request_json(
        f"{API_BASE}/auth",
        method="POST",
        body={"client_id": client_id, "client_secret": client_secret},
    )
    token = payload.get("data", {}).get("token")
    if not token:
        raise SystemExit(f"Auth response did not include a token: {payload}")
    return token


def fetch_page(token: str, offset: int) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        [("limit", PAGE_SIZE), ("offset", offset)]
        + [("attributes[]", name) for name in ATTRIBUTES]
    )
    return request_json(
        f"{API_BASE}/company/employees?{query}",
        headers={"Authorization": f"Bearer {token}"},
    )


def flatten_employee(raw: dict[str, Any]) -> dict[str, Any]:
    attributes = raw.get("attributes") or {}
    first_name = attr_value(attributes, "first_name")
    last_name = attr_value(attributes, "last_name")
    name_parts = [part for part in (first_name, last_name) if part]
    user_name = " ".join(name_parts) or None

    status = attr_value(attributes, "status")
    raw_employment_type = attr_value(attributes, "employment_type")

    employment_type = EMPLOYMENT_TYPE_MAP.get(raw_employment_type)
    if raw_employment_type and employment_type is None:
        print(
            f"Unknown Personio employment_type {raw_employment_type!r} for "
            f"{user_name or attr_value(attributes, 'id')} -- leaving employment_type unset.",
            file=sys.stderr,
        )

    return {
        "user_name": user_name,
        "user_email": attr_value(attributes, "email"),
        "employment_type": employment_type,
        "active": None if status is None else status not in INACTIVE_STATUSES,
        "personio_id": attr_value(attributes, "id"),
    }


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def sql_literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return f"'{sql_escape(str(value))}'"


def generate_sql(employees: list[dict[str, Any]]) -> str | None:
    usable = [e for e in employees if e.get("user_name") and e.get("user_email")]
    skipped = len(employees) - len(usable)
    if skipped:
        print(f"Skipping {skipped} employee(s) missing a name or email.", file=sys.stderr)

    # `ON CONFLICT DO UPDATE` can't affect the same target row twice in one
    # statement -- two Personio records sharing a user_name (a rehire with
    # two employee IDs, or two different people who happen to share a
    # name; the employees table only has room for one row per name) would
    # make the whole insert fail. Keep the first occurrence and warn
    # loudly about the rest, rather than silently dropping a real person.
    deduped: dict[str, dict[str, Any]] = {}
    duplicates: list[dict[str, Any]] = []
    for employee in usable:
        key = employee["user_name"]
        if key in deduped:
            duplicates.append(employee)
        else:
            deduped[key] = employee

    if duplicates:
        print(
            f"Found {len(duplicates)} duplicate user_name(s) -- keeping only the "
            "first occurrence of each, skipping the rest:",
            file=sys.stderr,
        )
        for employee in duplicates:
            print(
                f"  skipped: {employee['user_name']} <{employee['user_email']}> "
                f"(personio_id={employee.get('personio_id')})",
                file=sys.stderr,
            )

    usable = list(deduped.values())
    if not usable:
        return None

    rows = ",\n".join(
        "  ({}, {}, {}, {})".format(
            sql_literal(e["user_name"]),
            sql_literal(e["user_email"]),
            sql_literal(e["employment_type"]),
            sql_literal(e["active"]),
        )
        for e in usable
    )

    return f"""-- Refresh the employees directory from Personio (the authoritative
-- HR source) -- updates user_email, employment_type, and active for every
-- matching name. If this disagrees with a more recent Grover employee
-- sync for the same person, this (Personio) wins.
insert into employees (user_name, user_email, employment_type, active)
values
{rows}
on conflict (user_name) do update
set user_email = excluded.user_email,
    employment_type = excluded.employment_type,
    active = excluded.active,
    updated_at = now();
"""


def fetch_all_employees(token: str) -> list[dict[str, Any]]:
    employees: list[dict[str, Any]] = []
    offset = 0
    total_pages = None

    while True:
        page = fetch_page(token, offset)
        rows = page.get("data") or []
        employees.extend(flatten_employee(row) for row in rows)

        metadata = page.get("metadata") or {}
        total_pages = metadata.get("total_pages")
        current_page = metadata.get("current_page")
        total_elements = metadata.get("total_elements")
        print(
            f"Fetched offset {offset}: {len(rows)} row(s)"
            + (f" (page {current_page + 1}/{total_pages}, {total_elements} total)" if total_pages is not None else ""),
            file=sys.stderr,
        )

        if not rows:
            break
        if total_pages is not None and current_page is not None and current_page >= total_pages - 1:
            break
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return employees

def is_accepted_domain(email: str) -> bool:
    return email.endswith("@glow25.de") or email.endswith("@primal-state.de")

def main() -> None:
    client_id = os.environ.get("PERSONIO_CLIENT_ID", "").strip()
    client_secret = os.environ.get("PERSONIO_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise SystemExit(
            "Set PERSONIO_CLIENT_ID and PERSONIO_CLIENT_SECRET "
            "(Personio > Marketplace > Connected integrations)."
        )

    output_path = sys.argv[1] if len(sys.argv) > 1 else "personio-employees.json"
    sql_output_path = os.path.splitext(output_path)[0] + ".sql"

    print("Authenticating with Personio...", file=sys.stderr)
    token = authenticate(client_id, client_secret)
    employees = fetch_all_employees(token)

    employees = [e for e in employees if is_accepted_domain(e["user_email"])]

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(employees, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Wrote {len(employees)} employee(s) to {output_path}.", file=sys.stderr)

    sql = generate_sql(employees)
    if sql is None:
        print("No employees with both a name and an email -- skipped writing SQL.", file=sys.stderr)
    else:
        with open(sql_output_path, "w", encoding="utf-8") as handle:
            handle.write(sql)
        print(f"Wrote sync SQL to {sql_output_path}.", file=sys.stderr)


if __name__ == "__main__":
    main()
