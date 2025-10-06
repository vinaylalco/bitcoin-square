/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRAPI_URL?: string;
  readonly VITE_STRIPE_PUBLIC_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
