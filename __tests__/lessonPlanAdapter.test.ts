import { describe, it, expect, vi, afterEach } from "vitest";
import { getLessonPlan } from "../src/lib/strapi";

describe("getLessonPlan", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("maps Strapi response to the requested locale", async () => {
    const mock = {
      data: [
        {
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

    const lesson = await getLessonPlan("es");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("fields%5B0%5D=LessonPlanJSON");
    expect(url).toContain("populate%5Blocalizations%5D%5Bfields%5D%5B0%5D=LessonPlanJSON");
    expect(url).toContain("sort%5B0%5D=publishedAt%3Adesc");
    expect(lesson).toEqual({ title: "Español", topics: [], locale: "es" });
  });

  it("falls back to en when translation missing", async () => {
    const mock = {
      data: [
        {
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

    const lesson = await getLessonPlan("es");
    expect(lesson.locale).toBe("en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});