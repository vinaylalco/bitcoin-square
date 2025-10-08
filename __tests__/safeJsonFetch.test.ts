import { afterEach, describe, expect, it, vi } from "vitest";

import safeJsonFetch, { JsonFetchError } from "../src/utils/safeJsonFetch";

describe("safeJsonFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses JSON responses", async () => {
    const payload = { hello: "world" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await expect(safeJsonFetch<typeof payload>("https://example.com/profile")).resolves.toEqual(payload);
  });

  it("throws for non-ok responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(safeJsonFetch("https://example.com/missing")).rejects.toMatchObject<Partial<JsonFetchError>>({
      reason: "http-error",
      status: 404,
    });
  });

  it("throws when content type is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(safeJsonFetch("https://example.com/html")).rejects.toMatchObject<Partial<JsonFetchError>>({
      reason: "unexpected-content-type",
    });
  });

  it("throws when JSON is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(safeJsonFetch("https://example.com/bad-json")).rejects.toMatchObject<Partial<JsonFetchError>>({
      reason: "invalid-json",
    });
  });
});
