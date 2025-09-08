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
    expect(fetchMock.mock.calls[0][0]).toContain("populate=%2A");
    expect(fetchMock.mock.calls[0][0]).toContain("filters%5Bslug%5D%5B%24eq%5D=education");
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

  it("uses slug parameter when provided", async () => {
    const mock = { data: [] };
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => mock } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    await getLessonPlan("en", "custom-slug");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "filters%5Bslug%5D%5B%24eq%5D=custom-slug",
    );
  });
});