import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/safeJsonFetch", () => ({
  __esModule: true,
  default: vi.fn(),
}));

import safeJsonFetch from "../src/utils/safeJsonFetch";
import {
  countZapReferences,
  detectZapEndpoint,
  fetchLnurlDetails,
  lightningAddressToLnurl,
  requestZapInvoice,
  type LnurlPayResponse,
} from "../src/utils/zap";

const safeJsonFetchMock = vi.mocked(safeJsonFetch);

describe("zap utilities", () => {
  beforeEach(() => {
    safeJsonFetchMock.mockReset();
  });

  it("converts lightning addresses into LNURL pay endpoints", () => {
    expect(lightningAddressToLnurl("satoshi@example.com")).toBe(
      "https://example.com/.well-known/lnurlp/satoshi",
    );
  });

  it("detects zap endpoints from event tags", () => {
    const endpoint = detectZapEndpoint({
      tags: [["zap", "lightning:https://pay.example.com/callback"]],
    });

    expect(endpoint).toEqual({
      type: "lnurl",
      url: "https://pay.example.com/callback",
      source: "event",
      raw: "https://pay.example.com/callback",
    });
  });

  it("detects zap endpoints from profile lightning address", () => {
    const endpoint = detectZapEndpoint({ lightningAddress: "alex@nostr.example" });

    expect(endpoint).toEqual({
      type: "lnurl",
      url: "https://nostr.example/.well-known/lnurlp/alex",
      source: "profile",
      raw: "alex@nostr.example",
      address: "alex@nostr.example",
    });
  });

  it("detects bolt11 invoices from tags", () => {
    const endpoint = detectZapEndpoint({
      tags: [["zap", "lnbc1p0exampleinvoice"]],
    });

    expect(endpoint).toEqual({
      type: "bolt11",
      invoice: "lnbc1p0exampleinvoice",
      source: "event",
    });
  });

  it("counts zap references in tags", () => {
    expect(
      countZapReferences([
        ["p", "npub1..."],
        ["zap", "lnbc1"],
        ["zap", "lnbc2"],
      ]),
    ).toBe(2);
  });

  it("fetches LNURL pay metadata", async () => {
    const lnurlResponse: LnurlPayResponse = {
      callback: "https://pay.example.com/callback",
      maxSendable: 5000000,
      minSendable: 1000,
      metadata: "[]",
      commentAllowed: 120,
      allowsNostr: true,
    };

    safeJsonFetchMock.mockResolvedValueOnce(lnurlResponse);

    const result = await fetchLnurlDetails("https://pay.example.com/.well-known/lnurlp/alex");

    expect(result).toEqual(lnurlResponse);
    expect(safeJsonFetchMock.mock.calls[0]?.[0]).toBe("https://pay.example.com/.well-known/lnurlp/alex");
  });

  it("throws when LNURL pay metadata reports an error", async () => {
    safeJsonFetchMock.mockResolvedValueOnce({ status: "ERROR", reason: "not available" });

    await expect(fetchLnurlDetails("https://pay.example.com/fail")).rejects.toThrow("not available");
  });

  it("requests zap invoices with nostr metadata", async () => {
    const details: LnurlPayResponse = {
      callback: "https://pay.example.com/zap",
      maxSendable: 5000000,
      minSendable: 1000,
      metadata: "[]",
      commentAllowed: 120,
      allowsNostr: true,
    };

    const invoiceResponse = { pr: "lnbc1exampleinvoice" };

    safeJsonFetchMock.mockResolvedValueOnce(invoiceResponse);

    const signEvent = vi.fn(async (template: any) => ({
      id: "signed-event",
      pubkey: "pubkey",
      ...template,
    }));

    const result = await requestZapInvoice({
      details,
      amountMsat: 21000,
      targetPubkey: "targetpubkey",
      noteId: "note-id",
      relays: ["wss://relay.example"],
      comment: "Great post!",
      signEvent,
      lnurlRaw: "lnurl1example",
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual(invoiceResponse);
    expect(signEvent).toHaveBeenCalledTimes(1);
    expect(signEvent.mock.calls[0]?.[0]).toMatchObject({
      kind: 9734,
      tags: expect.arrayContaining([
        ["p", "targetpubkey"],
        ["e", "note-id"],
        ["amount", "21000"],
        ["relays", "wss://relay.example"],
        ["lnurl", "lnurl1example"],
      ]),
    });

    const requestedUrl = safeJsonFetchMock.mock.calls[0]?.[0];
    expect(typeof requestedUrl).toBe("string");
    expect(requestedUrl).toContain("https://pay.example.com/zap?");
    expect(requestedUrl).toContain("amount=21000");
    expect(requestedUrl).toContain("comment=Great+post%21");
    expect(requestedUrl).toContain("nostr=");
  });

  it("throws when a signer is not available", async () => {
    const details: LnurlPayResponse = {
      callback: "https://pay.example.com/zap",
      maxSendable: 5000000,
      minSendable: 1000,
      metadata: "[]",
    };

    await expect(
      requestZapInvoice({
        details,
        amountMsat: 21000,
        targetPubkey: "targetpubkey",
        signEvent: null,
      }),
    ).rejects.toThrow("Nostr signer is unavailable");
  });
});
