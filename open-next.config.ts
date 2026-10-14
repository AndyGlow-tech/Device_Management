// OpenNext config for the Cloudflare Workers adapter.
// incrementalCache/tagCache are left at their default ("dummy" -- a safe
// no-op) rather than the R2-backed option: this app's data is always read
// live from Supabase per request (no static generation/ISR to persist),
// and a dummy cache needs no extra Cloudflare resources (R2 bucket) to
// provision. See https://opennext.js.org/cloudflare/caching if that
// changes later.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
