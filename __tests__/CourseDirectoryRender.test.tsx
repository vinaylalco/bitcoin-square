// @vitest-environment node
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import CourseDirectory from "../src/routes/CourseDirectory";

const useAuthMock = vi.fn();
const useLessonPlansMock = vi.fn();
const useContentCreatorCoursesMock = vi.fn();
const useContentCreatorDraftCoursesMock = vi.fn();

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../src/hooks/useLessonPlans", () => ({
  useLessonPlans: () => useLessonPlansMock(),
}));

vi.mock("../src/hooks/useContentCreatorCourses", () => ({
  useContentCreatorCourses: () => useContentCreatorCoursesMock(),
  useContentCreatorDraftCourses: () => useContentCreatorDraftCoursesMock(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

describe("CourseDirectory", () => {
  it("renders even when course data is missing or malformed", () => {
    useAuthMock.mockReturnValue({ user: { id: 1, contentCreator: true } });
    useLessonPlansMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    useContentCreatorCoursesMock.mockReturnValue({
      data: null,
      isLoading: false,
    });
    useContentCreatorDraftCoursesMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    expect(() =>
      renderToString(
        <MemoryRouter>
          <CourseDirectory />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
