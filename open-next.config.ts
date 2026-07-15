import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep the default dummy caches: this project deliberately does not provision
// R2/KV/D1 resources for OpenNext caching.
export default defineCloudflareConfig();
