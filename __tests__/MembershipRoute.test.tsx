// @vitest-environment node
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import Membership from "../src/routes/Membership";

const useAuthMock = vi.fn();

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../src/hooks/useMembershipCheckout", () => ({
  useMembershipCheckout: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

describe("Membership route", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      login: vi.fn(),
      register: vi.fn(),
      user: null,
      completeAuthFromResponse: vi.fn(),
    });
  });

  it("renders with missing view param", () => {
    expect(() =>
      renderToString(
        <MemoryRouter initialEntries={["/membership"]}>
          <Membership />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it("renders with an unexpected view param", () => {
    expect(() =>
      renderToString(
        <MemoryRouter initialEntries={["/membership?view=surprise"]}>
          <Membership />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it("renders with empty discount and ref params", () => {
    expect(() =>
      renderToString(
        <MemoryRouter initialEntries={["/membership?view=login&discount=&ref="]}>
          <Membership />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
