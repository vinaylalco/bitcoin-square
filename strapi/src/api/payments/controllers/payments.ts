import { factories } from "@strapi/strapi";

const USER_LOOKUP_ATTEMPTS = 3;
const USER_LOOKUP_BACKOFF_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeTxSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

const sanitizeUserId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

export default factories.createCoreController("api::payments.payment", ({ strapi }) => ({
  async createSession(ctx) {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const rawEmail = typeof body.userEmail === "string" ? body.userEmail : "";
    const trimmedEmail = rawEmail.trim();

    if (!trimmedEmail) {
      return ctx.badRequest("Missing userEmail");
    }

    const normalizedEmail = trimmedEmail.toLowerCase();
    const normalizedUserId = sanitizeUserId(body.userId);

    body.userEmail = trimmedEmail;
    if (ctx.request.body && typeof ctx.request.body === "object") {
      (ctx.request.body as Record<string, unknown>).userEmail = trimmedEmail;
    }

    if (normalizedUserId !== null) {
      body.userId = normalizedUserId;
      if (ctx.request.body && typeof ctx.request.body === "object") {
        (ctx.request.body as Record<string, unknown>).userId = normalizedUserId;
      }
    } else {
      delete body.userId;
      if (ctx.request.body && typeof ctx.request.body === "object") {
        delete (ctx.request.body as Record<string, unknown>).userId;
      }
    }

    const hasDiscountField = Object.prototype.hasOwnProperty.call(
      body,
      "discountCode",
    );
    const rawDiscount =
      typeof body.discountCode === "string" ? body.discountCode.trim() : "";

    if (hasDiscountField) {
      const existingTxHash =
        typeof body.txHash === "string" ? body.txHash.trim() : "";

      const normalizedDiscountSegment =
        sanitizeTxSegment(rawDiscount || "FREE").toUpperCase() || "FREE";
      const emailHandle = normalizedEmail.split("@")[0] ?? normalizedEmail;
      const normalizedEmailSegment =
        sanitizeTxSegment(emailHandle).toUpperCase() || "USER";
      const normalizedExistingTxHash = existingTxHash.toUpperCase();
      const expectedPrefix = `DISCOUNT-${normalizedDiscountSegment}`;
      const shouldOverrideExisting =
        !existingTxHash ||
        normalizedExistingTxHash === expectedPrefix ||
        normalizedExistingTxHash.startsWith(`${expectedPrefix}-`);

      const discountTxHash = `DISCOUNT-${normalizedDiscountSegment}-${normalizedEmailSegment}`;
      const resolvedTxHash = shouldOverrideExisting ? discountTxHash : existingTxHash;

      body.txHash = resolvedTxHash;
      if (ctx.request.body && typeof ctx.request.body === "object") {
        (ctx.request.body as Record<string, unknown>).txHash = resolvedTxHash;
      }
    }

    const findUserById = async () => {
      if (normalizedUserId === null) {
        return null;
      }

      try {
        return await strapi.entityService.findOne(
          "plugin::users-permissions.user",
          normalizedUserId,
        );
      } catch (error) {
        strapi.log.warn(
          `Failed to resolve Strapi user by ID ${normalizedUserId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    };

    const findUserByEmail = async () => {
      try {
        const result = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { email: normalizedEmail },
            limit: 1,
          },
        );

        if (Array.isArray(result)) {
          return result[0] ?? null;
        }

        return result ?? null;
      } catch (error) {
        strapi.log.warn(
          `Failed to resolve Strapi user by email ${normalizedEmail}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      }
    };

    let attempt = 0;
    let resolvedUser: unknown = null;

    while (attempt < USER_LOOKUP_ATTEMPTS && !resolvedUser) {
      if (normalizedUserId !== null) {
        resolvedUser = await findUserById();
      }

      if (!resolvedUser) {
        resolvedUser = await findUserByEmail();
      }

      if (resolvedUser) {
        break;
      }

      attempt += 1;
      if (attempt < USER_LOOKUP_ATTEMPTS) {
        await sleep(USER_LOOKUP_BACKOFF_MS);
      }
    }

    if (!resolvedUser) {
      return ctx.notFound("User", { email: normalizedEmail });
    }

    ctx.state.checkoutUser = resolvedUser;

    return await super.createSession(ctx);
  },
}));
