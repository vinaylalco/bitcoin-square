export type JsonFetchFailureReason = "http-error" | "unexpected-content-type" | "invalid-json";

export interface JsonFetchInit extends RequestInit {
  /**
   * Expected content type prefix. Defaults to `application/json`.
   */
  expectedContentType?: string;
  /**
   * When true we avoid mutating the provided headers object.
   */
  immutableHeaders?: boolean;
}

const normalizeMime = (value: string | null) => (value ?? "").toLowerCase();

export class JsonFetchError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly contentType: string | null;
  readonly reason: JsonFetchFailureReason;
  readonly bodySnippet: string | null;

  constructor(options: {
    message: string;
    status: number;
    statusText: string;
    url: string;
    contentType: string | null;
    reason: JsonFetchFailureReason;
    bodySnippet?: string | null;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = "JsonFetchError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.url = options.url;
    this.contentType = options.contentType;
    this.reason = options.reason;
    this.bodySnippet = options.bodySnippet ?? null;
    if (options.cause) {
      // @ts-expect-error cause is only supported in newer runtimes but TS knows about it
      this.cause = options.cause;
    }
  }
}

const ensureHeaders = (init?: JsonFetchInit): HeadersInit => {
  if (!init?.headers) {
    return {
      Accept: "application/json",
    } satisfies HeadersInit;
  }
  if (init.immutableHeaders) {
    return init.headers;
  }
  const headers = init.headers instanceof Headers ? new Headers(init.headers) : new Headers(init.headers as HeadersInit);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  return headers;
};

const readBodySnippet = async (response: Response) => {
  try {
    const text = await response.text();
    return text.slice(0, 280);
  } catch {
    return null;
  }
};

export async function safeJsonFetch<T>(input: RequestInfo | URL, init?: JsonFetchInit): Promise<T> {
  const expected = init?.expectedContentType ?? "application/json";
  const response = await fetch(input, {
    ...init,
    headers: ensureHeaders(init),
  });

  const baseErrorInfo = {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    contentType: response.headers.get("content-type"),
  } as const;

  if (!response.ok) {
    const snippet = await readBodySnippet(response.clone());
    throw new JsonFetchError({
      message: `Request failed with status ${response.status}`,
      reason: "http-error",
      ...baseErrorInfo,
      bodySnippet: snippet,
    });
  }

  const text = await response.text();
  const contentType = normalizeMime(baseErrorInfo.contentType);
  const expectedPrefix = expected.toLowerCase();
  const isExpectedType = contentType.startsWith(expectedPrefix);

  if (!isExpectedType) {
    throw new JsonFetchError({
      message: "Response did not return JSON",
      reason: "unexpected-content-type",
      ...baseErrorInfo,
      bodySnippet: text.slice(0, 280),
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new JsonFetchError({
      message: "Response body is not valid JSON",
      reason: "invalid-json",
      ...baseErrorInfo,
      bodySnippet: text.slice(0, 280),
      cause: error,
    });
  }
}

export default safeJsonFetch;
