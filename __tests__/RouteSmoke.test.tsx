// @vitest-environment node
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Blog from "../src/routes/Blog";
import Contact from "../src/routes/Contact";
import BtcBuyingStrategiesPage from "../src/routes/BtcBuyingStrategiesPage";

vi.mock("../src/hooks/useBlogPosts", () => ({
  useBlogPosts: () => ({ posts: undefined }),
}));

vi.mock("../src/hooks/useContactContent", () => ({
  useContactContent: () => ({ content: {} }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const renderRoute = (path: string, element: React.ReactElement) =>
  renderToString(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  );

describe("Route smoke rendering", () => {
  it("renders key routes with empty data without throwing", () => {
    expect(() => renderRoute("/blog", <Blog />)).not.toThrow();
    expect(() => renderRoute("/contact", <Contact />)).not.toThrow();
    expect(() =>
      renderRoute("/tools/btc-buying-strategies", <BtcBuyingStrategiesPage />),
    ).not.toThrow();
  });
});
