import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // ISR cache disabled - R2 bucket requires extra API token permission.
  // Next.js falls back to re-rendering pages on each request.
  // Add r2IncrementalCache back once CLOUDFLARE_API_TOKEN has R2 scope.
  incrementalCache: undefined,
});
