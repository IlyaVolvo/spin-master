/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CHANGESET_ID?: string;
  readonly VITE_DEV_SERVER_PORT?: string;
  readonly VITE_DEV_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

