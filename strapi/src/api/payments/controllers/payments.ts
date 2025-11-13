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

const DISCOUNT_PREFIX = "DISCOUNT-";

const extractDiscountSegmentFromTxHash = (txHash: string): string | null => {
  if (!txHash || typeof txHash !== "string") {
    return null;
  }

  const trimmed = txHash.trim();
  if (!trimmed || !trimmed.toUpperCase().startsWith(DISCOUNT_PREFIX)) {
    return null;
  }

  const remainder = trimmed.slice(DISCOUNT_PREFIX.length);
  if (!remainder) {
    return null;
  }

  const [rawSegment] = remainder.split("-");
  const sanitized = sanitizeTxSegment(rawSegment ?? "");

  return sanitized ? sanitized.toUpperCase() : null;
};

const getBodyValue = (body: unknown, key: string): unknown => {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(record, key)) {
    return record[key];
  }

  const data = record.data;
  if (data && typeof data === "object") {
    const dataRecord = data as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(dataRecord, key)) {
      return dataRecord[key];
    }
  }

  return undefined;
};

const assignBodyValue = (
  target: unknown,
  key: string,
  value: unknown,
  options: { remove?: boolean } = {},
) => {
  if (!target || typeof target !== "object") {
    return;
  }

  const shouldRemove = options.remove ?? value === undefined;
  const record = target as Record<string, unknown>;

  if (shouldRemove) {
    delete record[key];
  } else {
    record[key] = value;
  }

  const data = record.data;
  if (data && typeof data === "object") {
    const dataRecord = data as Record<string, unknown>;
    if (shouldRemove) {
      delete dataRecord[key];
    } else {
      dataRecord[key] = value;
    }
  }
};

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
    const rawEmailValue = getBodyValue(body, "userEmail");
    const rawEmail = typeof rawEmailValue === "string" ? rawEmailValue : "";
    const trimmedEmail = rawEmail.trim();

    if (!trimmedEmail) {
      return ctx.badRequest("Missing userEmail");
    }

    const normalizedEmail = trimmedEmail.toLowerCase();
    const normalizedUserId = sanitizeUserId(getBodyValue(body, "userId"));

    assignBodyValue(body, "userEmail", trimmedEmail);
    assignBodyValue(ctx.request.body, "userEmail", trimmedEmail);

    if (normalizedUserId !== null) {
      assignBodyValue(body, "userId", normalizedUserId);
      assignBodyValue(ctx.request.body, "userId", normalizedUserId);
    } else {
      assignBodyValue(body, "userId", undefined, { remove: true });
      assignBodyValue(ctx.request.body, "userId", undefined, { remove: true });
    }

    const discountValue = getBodyValue(body, "discountCode");
    const hasDiscountField = discountValue !== undefined;
    const rawDiscount =
      typeof discountValue === "string"
        ? discountValue.trim()
        : String(discountValue ?? "").trim();
    const existingTxHashValue = getBodyValue(body, "txHash");
    const existingTxHash =
      typeof existingTxHashValue === "string"
        ? existingTxHashValue.trim()
        : String(existingTxHashValue ?? "").trim();
    const normalizedExistingTxHash = existingTxHash.toUpperCase();
    const existingDiscountSegment = extractDiscountSegmentFromTxHash(existingTxHash);
    const shouldFormatDiscountTx =
      hasDiscountField || existingDiscountSegment !== null;

    if (shouldFormatDiscountTx) {
      const resolvedDiscountSegment =
        sanitizeTxSegment(rawDiscount).toUpperCase() ||
        existingDiscountSegment ||
        "FREE";
      const emailHandle = normalizedEmail.split("@")[0] ?? normalizedEmail;
      const normalizedEmailSegment =
        sanitizeTxSegment(emailHandle).toUpperCase() || "USER";
      const expectedPrefix = `${DISCOUNT_PREFIX}${resolvedDiscountSegment}`;
      const shouldOverrideExisting =
        !existingTxHash ||
        normalizedExistingTxHash === expectedPrefix ||
        normalizedExistingTxHash.startsWith(`${expectedPrefix}-`);

      const discountTxHash = `${DISCOUNT_PREFIX}${resolvedDiscountSegment}-${normalizedEmailSegment}`;
      const resolvedTxHash = shouldOverrideExisting ? discountTxHash : existingTxHash;

      assignBodyValue(body, "txHash", resolvedTxHash);
      assignBodyValue(ctx.request.body, "txHash", resolvedTxHash);
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
