import React from "react";
import { render, screen } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BtcBuyingStrategiesPage from "../src/routes/BtcBuyingStrategiesPage";
import { fetchBtcDailyHistory } from "../src/utils/coindesk";

vi.mock("../src/utils/coindesk", () => ({
  fetchBtcDailyHistory: vi.fn(),
}));

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={["/tools/btc-buying-strategies"]}>
      <Routes>
        <Route path="/tools/btc-buying-strategies" element={<BtcBuyingStrategiesPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("BtcBuyingStrategiesPage silent loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_SILENT_BOOT_ERRORS", "true");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("keeps spinner visible during transient failures and renders content on success", async () => {
    const mockFetch = vi.mocked(fetchBtcDailyHistory);
    mockFetch
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({
        Data: [
          {
            TIME: 1700000000,
            CLOSE: 100,
            OPEN: 100,
            HIGH: 100,
            LOW: 100,
            VOLUME: 1,
          },
        ],
      });

    renderRoute();

    expect(screen.getByTestId("btc-strategies-spinner")).toBeInTheDocument();
    expect(screen.queryByText(/We hit a loading hiccup/i)).toBeNull();
    expect(screen.queryByText(/We hit a snag/i)).toBeNull();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
    expect(screen.queryByText(/We hit an issue loading data/i)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(screen.getByTestId("btc-strategies-spinner")).toBeInTheDocument();
    expect(screen.queryByText(/We hit a loading hiccup/i)).toBeNull();
    expect(screen.queryByText(/We hit a snag/i)).toBeNull();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(
      screen.getByText(/Simple Bitcoin Buying Plan/i),
    ).toBeInTheDocument();
  });
});
