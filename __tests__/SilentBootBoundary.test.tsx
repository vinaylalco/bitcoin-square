import React from "react";
import { render, screen } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import SilentBootBoundary from "../src/components/boot/SilentBootBoundary";

const ThrowOnce = () => {
  const shouldThrow = (ThrowOnce as { didThrow?: boolean }).didThrow !== true;
  if (shouldThrow) {
    (ThrowOnce as { didThrow?: boolean }).didThrow = true;
    throw new Error("Boom");
  }
  return <div>Recovered</div>;
};

describe("SilentBootBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    (ThrowOnce as { didThrow?: boolean }).didThrow = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows spinner during failure and recovers after backoff", () => {
    render(
      <SilentBootBoundary>
        <ThrowOnce />
      </SilentBootBoundary>,
    );

    expect(screen.getByTestId("silent-boot-spinner")).toBeInTheDocument();
    expect(screen.queryByText(/hiccup|snag|Something went wrong/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });
});
