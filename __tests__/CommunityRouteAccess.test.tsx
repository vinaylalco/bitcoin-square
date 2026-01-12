// @vitest-environment node
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import RequireLogin from "../src/components/RequireLogin";

const useAuthMock = vi.fn();

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("react-router-dom", async (original) => {
  const actual = await original<typeof import("react-router-dom")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/community", search: "", hash: "" }),
    Navigate: ({ children }: { children?: React.ReactNode }) => (
      <div data-mock-navigate>{children}</div>
    ),
  };
});

describe("Community route access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders community content for a logged-in user", () => {
    useAuthMock.mockReturnValue({
      user: { id: 1 },
      token: "token",
    });

    const output = renderToString(
      <RequireLogin redirectTo="/membership">
        <div>Community</div>
      </RequireLogin>,
    );

    expect(output).toContain("Community");
  });

  it("redirects to membership when logged out", () => {
    useAuthMock.mockReturnValue({
      user: null,
      token: null,
    });

    const output = renderToString(
      <RequireLogin redirectTo="/membership">
        <div>Community</div>
      </RequireLogin>,
    );

    expect(output).toContain("data-mock-navigate");
  });

  it("shows loading state while auth is resolving", () => {
    useAuthMock.mockReturnValue({
      user: null,
      token: "token",
    });

    const output = renderToString(
      <RequireLogin redirectTo="/membership">
        <div>Community</div>
      </RequireLogin>,
    );

    expect(output).toContain("Checking sign-in");
  });
});
