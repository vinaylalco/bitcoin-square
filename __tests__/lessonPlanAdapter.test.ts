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
          LessonPlanJSON: { course: { id: "en", name: "English", modules: [] } },
          localizations: [
            {
              locale: "es",
              LessonPlanJSON: {
                course: { id: "es", name: "Español", modules: [] },
              },
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
    expect(lesson).toMatchObject({ title: "Español", modules: [], locale: "es" });
  });

  it("falls back to en when translation missing", async () => {
    const mock = {
      data: [
        {
          slug: "education",
          locale: "en",
          LessonPlanJSON: { course: { id: "en", name: "English", modules: [] } },
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