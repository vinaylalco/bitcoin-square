import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createLessonPlanCheckoutSession,
  getLessonPlan,
  getLessonPlans,
} from "../src/lib/strapi";

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
    expect(fetchMock.mock.calls[0][0]).toContain("populate=*");
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

  it("preserves numeric ids and documentIds separately", async () => {
    const mock = {
      data: [
        {
          id: 42,
          documentId: "doc-123",
          title: "Course",
          locale: "en",
          coverImage: { url: "/img.jpg" },
          LessonPlanJSON: { course: { name: "Course" } },
        },
      ],
    };

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mock,
    } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";

    const [lesson] = await getLessonPlans("en");
    expect(lesson.id).toBe(42);
    expect(lesson.documentId).toBe("doc-123");
  });
});

describe("createLessonPlanCheckoutSession", () => {
  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("posts to the Strapi numeric id endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "sess_123" }),
    } as any);

    process.env.NEXT_PUBLIC_STRAPI_URL = "http://test";
    process.env.NEXT_PUBLIC_SITE_URL = "https://frontend.test";

    const response = await createLessonPlanCheckoutSession(7, "price_123");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/lesson-plans/7/create-checkout-session",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      priceId: "price_123",
      stripePriceId: "price_123",
      price: "price_123",
      successUrl: "https://frontend.test/checkout/success",
      cancelUrl: "https://frontend.test/checkout/cancel",
    });
    expect(response.id).toBe("sess_123");
  });
});