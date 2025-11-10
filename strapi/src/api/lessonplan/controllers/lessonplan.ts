import { factories } from "@strapi/strapi";

type CountQuery = {
  filters?: unknown;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export default factories.createCoreController(
  "api::lessonplan.lessonplan",
  ({ strapi }) => ({
    async count(ctx) {
      const query = (ctx.query ?? {}) as CountQuery;
      const rawFilters = query.filters;
      const filters = isPlainObject(rawFilters) ? rawFilters : undefined;

      const count = await strapi.entityService.count(
        "api::lessonplan.lessonplan",
        filters ? { filters } : undefined,
      );

      ctx.body = { count };
    },
  }),
);
