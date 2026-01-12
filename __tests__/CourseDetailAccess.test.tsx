// @vitest-environment node
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import CourseDetail from "../src/routes/CourseDetail";

const useAuthMock = vi.fn();
const useLessonPlanMock = vi.fn();
const useContentCreatorCourseMock = vi.fn();

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../src/hooks/useLessonPlan", () => ({
  useLessonPlan: (...args: unknown[]) => useLessonPlanMock(...args),
}));

vi.mock("../src/hooks/useContentCreatorCourse", () => ({
  useContentCreatorCourse: (...args: unknown[]) => useContentCreatorCourseMock(...args),
}));

vi.mock("../src/components/lesson/Slider", () => ({
  default: ({ isLessonAccessRestricted }: { isLessonAccessRestricted?: boolean }) => (
    <div data-slider>restricted:{String(Boolean(isLessonAccessRestricted))}</div>
  ),
}));

vi.mock("../src/utils/courseNormalization", () => ({
  normalizeLessonPlanCourse: (course: { title?: string; slug?: string }) => ({
    type: "lessonPlan",
    title: course.title ?? "Course",
    slug: course.slug ?? "btc-practical-course",
  }),
  normalizeContentCreatorCourse: () => null,
  canViewCourse: () => true,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
    i18n: { language: "en" },
  }),
}));

vi.mock("react-router-dom", async (original) => {
  const actual = await original<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ slug: "btc-practical-course" }),
  };
});

describe("CourseDetail access", () => {
  it("does not restrict lessons for logged-in users", () => {
    useAuthMock.mockReturnValue({ user: { id: 1 } });
    useLessonPlanMock.mockReturnValue({
      data: { slug: "btc-practical-course", title: "BTC Practical Course", modules: [] },
      isLoading: false,
      error: null,
    });
    useContentCreatorCourseMock.mockReturnValue({ data: null, isLoading: false });

    const output = renderToString(<CourseDetail />);

    expect(output).toContain("restricted:false");
  });
});
