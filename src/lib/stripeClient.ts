const STRIPE_JS_SRC = "https://js.stripe.com/v3";

interface StripeRedirectResult {
  error?: {
    message?: string;
  };
}

export interface StripeClient {
  redirectToCheckout(options: { sessionId: string }): Promise<StripeRedirectResult>;
}

type StripeLoader = (publicKey: string) => StripeClient;

declare global {
  interface Window {
    Stripe?: StripeLoader;
  }
}

let stripeClientPromise: Promise<StripeClient | null> | null = null;
let stripeScriptPromise: Promise<void> | null = null;

function getPublicKey(): string | undefined {
  const metaEnv =
    typeof import.meta !== "undefined" && (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (metaEnv) {
    return (
      metaEnv.VITE_STRIPE_PUBLIC_KEY ||
      metaEnv.NEXT_PUBLIC_STRIPE_PUBLIC_KEY ||
      metaEnv.STRIPE_PUBLISHABLE_KEY
    );
  }

  if (typeof process !== "undefined" && typeof process.env !== "undefined") {
    return (
      process.env.VITE_STRIPE_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY ||
      process.env.STRIPE_PUBLISHABLE_KEY
    );
  }

  return undefined;
}

function ensureStripeScript(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }

  if (window.Stripe) {
    return Promise.resolve();
  }

  if (stripeScriptPromise) {
    return stripeScriptPromise;
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_JS_SRC}"]`);
  if (existing) {
    stripeScriptPromise = new Promise<void>((resolve, reject) => {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", () => {
        existing.dataset.loaded = "true";
        resolve();
      });
      existing.addEventListener("error", () => {
        reject(new Error("Failed to load Stripe.js"));
      });
    });
    return stripeScriptPromise;
  }

  stripeScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = STRIPE_JS_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      reject(new Error("Failed to load Stripe.js"));
    };
    document.head.appendChild(script);
  });

  return stripeScriptPromise;
}

export async function getStripe(): Promise<StripeClient | null> {
  if (stripeClientPromise) {
    return stripeClientPromise;
  }

  stripeClientPromise = (async () => {
    const publicKey = getPublicKey();
    if (!publicKey) {
      return null;
    }

    await ensureStripeScript();

    if (typeof window === "undefined" || typeof window.Stripe !== "function") {
      return null;
    }

    try {
      const client = window.Stripe(publicKey);
      return client ?? null;
    } catch (error) {
      console.error("Failed to initialize Stripe client", error);
      return null;
    }
  })();

  return stripeClientPromise;
}

export function resetStripeClientCache(): void {
  stripeClientPromise = null;
}
