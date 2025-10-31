export type Primitive = string | number | boolean | null | undefined;

export type AxiosRequestHeaders = Record<string, string>;

export type AxiosRequestConfig = {
  baseURL?: string;
  url?: string;
  method?: string;
  headers?: AxiosRequestHeaders;
  params?: Record<string, Primitive | Primitive[]>;
  data?: unknown;
};

export type AxiosResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
  headers: AxiosRequestHeaders;
  config: AxiosRequestConfig;
};

export class AxiosError<T = unknown> extends Error {
  declare config: AxiosRequestConfig;
  declare response?: AxiosResponse<T>;
  declare status?: number;

  constructor(message: string, config: AxiosRequestConfig, response?: AxiosResponse<T>) {
    super(message);
    this.name = "AxiosError";
    this.config = config;
    this.response = response;
    this.status = response?.status;
  }
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.replace(/\/+$/, "") : value;
}

function normalizeBaseUrl(baseURL?: string): string | undefined {
  if (!baseURL) return undefined;
  const trimmed = baseURL.trim();
  if (!trimmed) return undefined;
  return trimTrailingSlash(trimmed);
}

function serializeParams(params: AxiosRequestConfig["params"]): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        search.append(key, String(item));
      }
      continue;
    }
    search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function buildUrl(config: AxiosRequestConfig): string {
  const { baseURL, url = "", params } = config;
  const normalizedBase = normalizeBaseUrl(baseURL);
  if (isAbsoluteUrl(url)) {
    return `${trimTrailingSlash(url)}${serializeParams(params)}`;
  }
  const relativePath = url.startsWith("/") ? url : `/${url}`;
  const prefix = normalizedBase ?? "";
  const fullUrl = `${prefix}${relativePath}` || relativePath;
  return `${fullUrl}${serializeParams(params)}`;
}

function mergeHeaders(
  defaults: AxiosRequestHeaders | undefined,
  overrides: AxiosRequestHeaders | undefined,
): AxiosRequestHeaders {
  return {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

async function dispatchRequest<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const finalConfig: AxiosRequestConfig = {
    method: "GET",
    headers: {},
    ...config,
  };

  const method = (finalConfig.method ?? "GET").toUpperCase();
  const headers = mergeHeaders(finalConfig.headers, {});
  const url = buildUrl(finalConfig);

  const init: RequestInit = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD") {
    if (finalConfig.data instanceof FormData) {
      init.body = finalConfig.data;
    } else if (
      typeof finalConfig.data === "string" ||
      finalConfig.data instanceof Blob ||
      finalConfig.data instanceof ArrayBuffer
    ) {
      init.body = finalConfig.data as BodyInit;
    } else if (finalConfig.data !== undefined) {
      init.body = JSON.stringify(finalConfig.data);
      init.headers = {
        ...(init.headers as Record<string, string>),
        "Content-Type": (init.headers as Record<string, string>)["Content-Type"] ?? "application/json",
      };
    }
  }

  const response = await fetch(url, init);
  const headersObject: AxiosRequestHeaders = {};
  response.headers.forEach((value, key) => {
    headersObject[key] = value;
  });

  const payload = (await parseResponseBody(response)) as T;
  const axiosResponse: AxiosResponse<T> = {
    data: payload,
    status: response.status,
    statusText: response.statusText,
    headers: headersObject,
    config: finalConfig,
  };

  if (!response.ok) {
    throw new AxiosError(`Request failed with status ${response.status}`, finalConfig, axiosResponse);
  }

  return axiosResponse;
}

export interface AxiosInstance {
  <T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  defaults: AxiosRequestConfig;
}

function create(config: AxiosRequestConfig = {}): AxiosInstance {
  const defaults: AxiosRequestConfig = {
    baseURL: config.baseURL,
    headers: config.headers ?? {},
  };

  const instance = ((requestConfig: AxiosRequestConfig) =>
    dispatchRequest({
      ...defaults,
      ...requestConfig,
      headers: mergeHeaders(defaults.headers, requestConfig.headers),
    })) as AxiosInstance;

  instance.defaults = defaults;

  instance.request = (requestConfig) => instance(requestConfig);
  instance.get = (url, requestConfig = {}) =>
    instance({ ...requestConfig, method: "GET", url });
  instance.post = (url, data, requestConfig = {}) =>
    instance({ ...requestConfig, method: "POST", url, data });
  instance.put = (url, data, requestConfig = {}) =>
    instance({ ...requestConfig, method: "PUT", url, data });
  instance.patch = (url, data, requestConfig = {}) =>
    instance({ ...requestConfig, method: "PATCH", url, data });
  instance.delete = (url, requestConfig = {}) =>
    instance({ ...requestConfig, method: "DELETE", url });

  return instance;
}

function isAxiosError<T = unknown>(error: unknown): error is AxiosError<T> {
  return error instanceof AxiosError;
}

const axios = Object.assign(create, {
  create,
  AxiosError,
  isAxiosError,
});

export { create, isAxiosError, AxiosError };
export default axios;
