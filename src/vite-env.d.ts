/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRAPI_URL?: string;
  readonly VITE_STRIPE_PUBLIC_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_CASUAL_ROOM_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BitcoinSquareRuntimeConfig {
  casualRoomKey?: string;
}

declare global {
  interface Window {
    __BITCOINSQUARE_CONFIG__?: BitcoinSquareRuntimeConfig;
  }
}

export {};
