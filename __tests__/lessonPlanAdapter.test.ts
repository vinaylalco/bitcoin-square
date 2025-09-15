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
          LessonPlanJSON: {
            module: {
              id: "M1",
              name: "English Module",
              topics: [{ name: "Topic EN", cards: [] }],
            },
          },
          localizations: [
            {
              locale: "es",
              LessonPlanJSON: {
                topics: [{ name: "Topic ES", cards: [] }],
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
    expect(fetchMock.mock.calls[0][0]).toContain("populate=*");
    expect(lesson.locale).toBe("es");
    expect(lesson.topics).toEqual([{ name: "Topic ES", cards: [] }]);
    expect(lesson.title).toBe("English Module");
  });

  it("falls back to en when translation missing", async () => {
    const mock = {
      data: [
        {
          slug: "education",
          locale: "en",
          LessonPlanJSON: {
            module: { id: "M1", name: "English Module", topics: [] },
          },
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