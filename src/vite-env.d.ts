/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRAPI_URL?: string;
  readonly VITE_STRIPE_PUBLIC_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_CASUAL_ROOM_KEY?: string;
  readonly VITE_MEDIA_UPLOAD_HOSTS?: string;
  readonly VITE_MEDIA_UPLOAD_ENDPOINT_NOSTR_BUILD?: string;
  readonly VITE_MEDIA_UPLOAD_ENDPOINT_VOID_CAT?: string;
  readonly VITE_MEDIA_UPLOAD_NOSTR_BUILD_API_KEY?: string;
  readonly VITE_TRANSLATION_API_URL?: string;
  readonly VITE_TRANSLATION_API_KEY?: string;
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
