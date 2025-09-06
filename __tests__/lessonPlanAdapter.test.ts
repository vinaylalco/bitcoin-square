import { describe, it, expect, vi, afterEach } from "vitest";
import { getLessonPlan } from "../src/lib/strapi";

describe("getLessonPlan", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("maps Strapi response to LessonPlan", async () => {
    const mock = {
      data: [
        {
          attributes: {
            LessonPlanJSON: { title: "Test", topics: [] },
            locale: "en",
          },
        },
      ],
    };

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mock,
    } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const lesson = await getLessonPlan("en");
    expect(lesson).toEqual({ title: "Test", topics: [], locale: "en" });
  });

  it("falls back to en when translation missing", async () => {
    const es = { data: [] };
    const en = {
      data: [
        {
          attributes: {
            LessonPlanJSON: { title: "English", topics: [] },
            locale: "en",
          },
        },
      ],
    };
    const fetchMock = vi.spyOn(global, "fetch");
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => es } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => en } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const lesson = await getLessonPlan("es");
    expect(lesson.locale).toBe("en");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
