import React from "react";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

import RequireMembership from "../src/components/RequireMembership";

const useAuthMock = vi.fn();
const useCurrentUserMembershipMock = vi.fn();
const normalizeMembershipStatusMock = vi.fn();
const extractGrandfatheredFlagMock = vi.fn();

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../src/hooks/useCurrentUserMembership", () => ({
  useCurrentUserMembership: (options?: unknown) =>
    useCurrentUserMembershipMock(options),
}));

vi.mock("react-router-dom", async (original) => {
  const actual = await original<typeof import("react-router-dom")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/education", search: "", hash: "" }),
    Navigate: ({ children }: { children?: React.ReactNode }) => (
      <div data-mock-navigate>{children}</div>
    ),
  };
});

vi.mock("../src/utils/membership", async (original) => {
  const actual = await original();
  return {
    ...actual,
    normalizeMembershipStatus: (value: unknown) =>
      normalizeMembershipStatusMock(value),
    extractGrandfatheredFlag: (value: unknown) =>
      extractGrandfatheredFlagMock(value),
  };
});

describe("RequireMembership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthMock.mockReturnValue({ token: null });
    useCurrentUserMembershipMock.mockReturnValue({
      me: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    normalizeMembershipStatusMock.mockReturnValue({
      status: null,
      type: null,
      expiresAt: null,
      isActive: false,
    });
    extractGrandfatheredFlagMock.mockReturnValue(false);
  });

  it("always calls the membership hook even before authentication", () => {
    renderToString(
      <RequireMembership>
        <div>Protected</div>
      </RequireMembership>,
    );

    expect(useCurrentUserMembershipMock).toHaveBeenCalledTimes(1);
    expect(useCurrentUserMembershipMock).toHaveBeenCalledWith({ enabled: false });
  });

  it("renders protected content when membership is active", () => {
    useAuthMock.mockReturnValue({ token: "test-token" });
    useCurrentUserMembershipMock.mockReturnValue({
      me: { membership: { status: "active" } },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    normalizeMembershipStatusMock.mockReturnValue({
      status: "active",
      type: "annual",
      expiresAt: null,
      isActive: true,
    });

    const output = renderToString(
      <RequireMembership>
        <div>Protected</div>
      </RequireMembership>,
    );

    expect(useCurrentUserMembershipMock).toHaveBeenCalledWith({ enabled: true });
    expect(output).toContain("Protected");
  });
});
