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
          id: 1,
          attributes: {
            documentId: "doc-1",
            slug: "full-btc-course",
            locales: {
              en: { course: { id: "btc-full-course", name: "BTC Full Course", modules: [] } },
              es: { course: { id: "btc-full-course", name: "Curso Completo BTC", modules: [] } },
            },
          },
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

    const lesson = await getLessonPlan("es", "btc-full-course");
    expect(fetchMock.mock.calls[0][0]).toContain("populate=%2A");
    expect(lesson).toMatchObject({
      title: "Curso Completo BTC",
      modules: [],
      locale: "es",
      slug: "full-btc-course",
    });
  });

  it("falls back to english when translation missing", async () => {
    const mock = {
      data: [
        {
          id: 2,
          attributes: {
            slug: "btc-full-course",
            locales: {
              en: { course: { id: "btc-full-course", name: "BTC Full Course", modules: [] } },
            },
          },
        },
      ],
    };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mock,
    } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const lesson = await getLessonPlan("es", "btc-full-course");
    expect(lesson.locale).toBe("en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves course slug from id or name", async () => {
    const byIdMock = {
      data: [
        {
          id: 3,
          attributes: {
            locales: {
              en: { course: { id: "c-101", name: "Course via ID", modules: [] } },
            },
          },
        },
      ],
    };

    const byNameMock = {
      data: [
        {
          id: 4,
          attributes: {
            locales: {
              en: { course: { name: "Course 101", modules: [] } },
            },
          },
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

  it("maps lesson plans list for locale", async () => {
    const mock = {
      data: [
        {
          id: 1,
          attributes: {
            documentId: "doc-1",
            locales: {
              en: {
                course: {
                  id: "btc-full-course",
                  name: "BTC Full Course",
                  modules: [
                    {
                      id: "M1",
                      name: "Module 1",
                      topics: [
                        {
                          id: "T1",
                          name: "Topic",
                          cards: [
                            { id: "C1", title: "Card 1" },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    };

    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mock,
    } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const lessons = await getLessonPlans("en");
    expect(fetchMock.mock.calls[0][0]).toContain("populate=%2A");
    expect(lessons[0]).toMatchObject({
      id: "doc-1",
      slug: "btc-full-course",
      title: "BTC Full Course",
      modules: [
        {
          id: "M1",
          topics: [
            {
              cards: [{ id: "C1", title: "Card 1" }],
            },
          ],
        },
      ],
    });
  });
});