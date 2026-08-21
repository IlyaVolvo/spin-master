/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CHANGESET_ID?: string;
  readonly VITE_DEV_SERVER_PORT?: string;
  readonly VITE_DEV_API_ORIGIN?: string;
  /** Optional text before the product name in the browser tab title. */
  readonly VITE_PAGE_TITLE_BEFORE?: string;
  /** Optional text after the product name in the browser tab title. */
  readonly VITE_PAGE_TITLE_AFTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

