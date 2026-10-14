/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Path prefix (or absolute origin) the API is served under. Defaults to
   * "/api", which the dev proxy and the production nginx both forward to the
   * backend. See src/api/config.ts.
   */
  readonly VITE_API_BASE_URL?: string
  /**
   * Seconds between trigger-list polls. Default 120, minimum 15, `0`
   * disables polling. See src/api/config.ts.
   */
  readonly VITE_TRIGGERS_POLL_SECONDS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
