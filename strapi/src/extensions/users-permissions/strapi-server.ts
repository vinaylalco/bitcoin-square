import type { Core, Strapi as StrapiInstance } from "@strapi/strapi";

declare const strapi: StrapiInstance;

type CountQuery = {
  filters?: unknown;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export default (plugin: Core.Plugin) => {
  plugin.controllers.user.countUsers = async (ctx) => {
    const query = (ctx.query ?? {}) as CountQuery;
    const rawFilters = query.filters;
    const filters = isPlainObject(rawFilters) ? rawFilters : undefined;

    const count = await strapi.entityService.count(
      "plugin::users-permissions.user",
      filters ? { filters } : undefined,
    );

    ctx.body = { count };
  };

  const contentApi = plugin.routes["content-api"];
  if (contentApi) {
    const hasExistingRoute = contentApi.routes.some(
      (route) => route.method === "GET" && route.path === "/users/count",
    );

    if (!hasExistingRoute) {
      contentApi.routes.push({
        method: "GET",
        path: "/users/count",
        handler: "user.countUsers",
        config: {
          auth: {
            scope: ["plugin::users-permissions.user.find"],
          },
        },
      });
    }
  }

  return plugin;
};
