import React from "react";
import { render, screen } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalErrorBoundary from "../src/components/GlobalErrorBoundary";

const ThrowLengthError = () => {
  throw new Error("Cannot read property 'length' of undefined");
};

const ThrowGenericError = () => {
  throw new Error("Boom");
};

describe("GlobalErrorBoundary length-error suppression", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(window, "location", {
      value: {
        ...originalLocation,
        pathname: "/tools/btc-buying-strategies",
        reload: vi.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
    vi.unstubAllEnvs();
  });

  it("shows spinner and skips reload when flagged", () => {
    vi.stubEnv("VITE_SILENT_BOOT_ERRORS", "true");

    render(
      <GlobalErrorBoundary>
        <ThrowLengthError />
      </GlobalErrorBoundary>,
    );

    expect(screen.getByTestId("global-error-spinner")).toBeInTheDocument();
    expect(
      screen.queryByText(/We hit a loading hiccup/i),
    ).toBeNull();

    act(() => {
      vi.runAllTimers();
    });

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("suppresses generic error UI when flagged", () => {
    vi.stubEnv("VITE_SILENT_BOOT_ERRORS", "true");

    render(
      <GlobalErrorBoundary>
        <ThrowGenericError />
      </GlobalErrorBoundary>,
    );

    expect(screen.getByTestId("global-error-spinner")).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });

  it("keeps hiccup UI and reload when flag disabled", () => {
    vi.stubEnv("VITE_SILENT_BOOT_ERRORS", "false");
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        pathname: "/another-route",
        reload: vi.fn(),
      },
      writable: true,
    });

    render(
      <GlobalErrorBoundary>
        <ThrowLengthError />
      </GlobalErrorBoundary>,
    );

    expect(
      screen.getByText(/We hit a loading hiccup/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("global-error-spinner")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps error UI for community routes when flagged", () => {
    vi.stubEnv("VITE_SILENT_BOOT_ERRORS", "true");
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        pathname: "/community",
        reload: vi.fn(),
      },
      writable: true,
    });

    render(
      <GlobalErrorBoundary>
        <ThrowLengthError />
      </GlobalErrorBoundary>,
    );

    expect(
      screen.getByText(/We hit a loading hiccup/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("global-error-spinner")).toBeNull();
  });
});
