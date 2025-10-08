export {};

declare global {
  interface WebLNProvider {
    enable: () => Promise<void>;
    sendPayment: (invoice: string) => Promise<unknown>;
  }

  interface Window {
    webln?: WebLNProvider;
  }
}
