import { describe, it, expect, vi, afterEach } from "vitest";
import { getLessonPlan, getLessonPlans } from "../src/lib/strapi";

describe("getLessonPlan", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("maps Strapi response to the requested locale", async () => {
    const mock = {
      data: [
        {
          slug: "education",
          locale: "en",
          LessonPlanJSON: { title: "English", topics: [] },
          localizations: [
            {
              locale: "es",
              LessonPlanJSON: { title: "Español", topics: [] },
            },
          ],
        },
      ],
    };

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mock,
      } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const lesson = await getLessonPlan("es", "education");
    expect(fetchMock.mock.calls[0][0]).toContain("populate=%2A");
    expect(lesson).toMatchObject({ title: "Español", topics: [], locale: "es" });
  });

  it("falls back to en when translation missing", async () => {
    const mock = {
      data: [
        {
          slug: "education",
          locale: "en",
          LessonPlanJSON: { title: "English", topics: [] },
          localizations: [],
        },
      ],
    };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mock,
    } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const lesson = await getLessonPlan("es", "education");
    expect(lesson.locale).toBe("en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves course slug from id or name", async () => {
    const byIdMock = {
      data: [
        {
          id: 1,
          locale: "en",
          title: "Course via ID",
          LessonPlanJSON: {
            title: "Course via ID",
            topics: [],
            course: { id: "c-101" },
          },
          localizations: [],
        },
      ],
    };

    const byNameMock = {
      data: [
        {
          id: 2,
          locale: "en",
          title: "Course via Name",
          LessonPlanJSON: {
            title: "Course via Name",
            topics: [],
            course: { name: "Course 101" },
          },
          localizations: [],
        },
      ],
    };

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => byIdMock } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => byNameMock } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const byId = await getLessonPlan("en", "c-101");
    expect(byId).toMatchObject({ slug: "c-101" });

    const byName = await getLessonPlan("en", "course-101");
    expect(byName).toMatchObject({ slug: "course-101" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getLessonPlans", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("requests cover image population", async () => {
    const mock = { data: [] };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mock,
    } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    await getLessonPlans("en");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "populate%5B0%5D=coverImage",
    );
    expect(fetchMock.mock.calls[0][0]).toContain(
      "filters%5Blocale%5D%5B%24eq%5D=en",
    );
  });
});