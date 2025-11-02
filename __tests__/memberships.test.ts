import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

import safeJsonFetch from "../src/utils/safeJsonFetch";
import {
  buildMembershipStatusUrl,
  fetchLatestMembershipByEmail,
  isMembershipActive,
  type MembershipEntry,
} from "../src/api/memberships";

vi.mock("../src/utils/safeJsonFetch", () => ({
  __esModule: true,
  default: vi.fn(() => Promise.resolve({ data: [] })),
}));

describe("memberships API", () => {
  const safeJsonFetchMock = safeJsonFetch as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds membership status URL with proper relation filter", () => {
    const url = buildMembershipStatusUrl("user@example.com");
    expect(url).toBe(
      "https://headless.bitcoinsquare.io/api/memberships?filters[users_permissions_user][email][$eq]=user%40example.com&pagination[pageSize]=1&sort[0]=updatedAt:desc&populate[users_permissions_user]=*",
    );
  });

  it("queries headless memberships endpoint with normalized email", async () => {
    await fetchLatestMembershipByEmail("   member@example.com   ");
    expect(safeJsonFetchMock).toHaveBeenCalledWith(
      "https://headless.bitcoinsquare.io/api/memberships?filters[users_permissions_user][email][$eq]=member%40example.com&pagination[pageSize]=1&sort[0]=updatedAt:desc&populate[users_permissions_user]=*",
    );
  });

  it("returns null when email is empty", async () => {
    await expect(fetchLatestMembershipByEmail("   ")).resolves.toBeNull();
    expect(safeJsonFetchMock).not.toHaveBeenCalled();
  });

  it("detects active memberships from attributes", () => {
    const active: MembershipEntry = {
      id: 1,
      attributes: { status: "active" },
    };
    const inactive: MembershipEntry = {
      id: 2,
      attributes: { status: "expired" },
    };
    const byDate: MembershipEntry = {
      id: 3,
      attributes: { expiresAt: new Date(Date.now() + 60_000).toISOString() },
    };
    const expiredByDate: MembershipEntry = {
      id: 4,
      attributes: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    };

    expect(isMembershipActive(active)).toBe(true);
    expect(isMembershipActive(inactive)).toBe(false);
    expect(isMembershipActive(byDate)).toBe(true);
    expect(isMembershipActive(expiredByDate)).toBe(false);
    expect(isMembershipActive(null)).toBe(false);
  });
});
