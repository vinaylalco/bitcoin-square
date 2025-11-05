import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMembershipCheckout } from "../src/lib/strapi";

const STRAPI_BASE_URL = "https://cms.example.com";

describe("createMembershipCheckout", () => {
  beforeEach(() => {
    process.env.VITE_STRAPI_URL = STRAPI_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VITE_STRAPI_URL;
  });

  it("sends the optional userId when provided", async () => {
    const responsePayload = { invoiceUrl: "https://payments.example.com/session" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await createMembershipCheckout({
      membershipType: "annual",
      userEmail: "new-user@example.com",
      discountCode: "SAVE10",
      userId: 512,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${STRAPI_BASE_URL}/api/payments/create-session`);
    const requestInit = init as RequestInit;
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toMatchObject({ "Content-Type": "application/json" });
    const parsedBody = JSON.parse(String(requestInit.body));
    expect(parsedBody).toMatchObject({
      membershipType: "annual",
      userEmail: "new-user@example.com",
      discountCode: "SAVE10",
      userId: 512,
    });
  });
});
