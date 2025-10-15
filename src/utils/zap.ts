import safeJsonFetch from "./safeJsonFetch";
import type { Event, EventTemplate } from "../lib/nostrToolsShim";

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

const LIGHTNING_PREFIX = "lightning:";

export const isBolt11 = (value: string) => /^lnbc[a-z0-9]+$/i.test(value.trim());

export const isLightningAddress = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.includes("@")) return false;
  const [name, domain] = trimmed.split("@");
  return Boolean(name) && Boolean(domain) && !/\s/.test(trimmed);
};

export const isLnurl = (value: string) => value.trim().toLowerCase().startsWith("lnurl");

export const buildLightningUri = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().startsWith(LIGHTNING_PREFIX) ? trimmed : `${LIGHTNING_PREFIX}${trimmed}`;
};

const convertBits = (data: number[], from: number, to: number, pad: boolean) => {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxValue = (1 << to) - 1;
  const maxAcc = (1 << (from + to - 1)) - 1;

  for (const value of data) {
    if (value < 0 || value >> from !== 0) {
      return null;
    }
    acc = (acc << from) | value;
    if ((acc & maxAcc) !== acc) {
      return null;
    }
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.push((acc >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (to - bits)) & maxValue);
    }
  } else if (bits >= from || ((acc << (to - bits)) & maxValue) !== 0) {
    return null;
  }

  return new Uint8Array(result);
};

const decodeBech32 = (value: string): Uint8Array | null => {
  const normalized = value.trim();
  const hasUpper = normalized.toUpperCase() === normalized;
  const hasLower = normalized.toLowerCase() === normalized;
  if (hasUpper && hasLower) {
    return null;
  }
  const input = hasUpper ? normalized.toLowerCase() : normalized;
  const separatorIndex = input.lastIndexOf("1");
  if (separatorIndex <= 0 || separatorIndex + 7 > input.length) {
    return null;
  }
  const dataPart = input.slice(separatorIndex + 1);
  const data: number[] = [];
  for (const char of dataPart) {
    const index = BECH32_CHARSET.indexOf(char);
    if (index === -1) {
      return null;
    }
    data.push(index);
  }
  // ignore checksum (last 6 values)
  const values = data.slice(0, -6);
  return convertBits(values, 5, 8, false);
};

export const decodeLnurl = (value: string): string | null => {
  try {
    const decoded = decodeBech32(value);
    if (!decoded) return null;
    return new TextDecoder().decode(decoded);
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.warn("Unable to decode LNURL", error);
    }
    return null;
  }
};

export const lightningAddressToLnurl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!isLightningAddress(trimmed)) return null;
  const [name, domain] = trimmed.split("@");
  return `https://${domain}/.well-known/lnurlp/${name}`;
};

export type ZapEndpoint =
  | {
      type: "lnurl";
      url: string;
      source: "profile" | "event" | "tag";
      raw: string;
      address?: string | null;
    }
  | {
      type: "bolt11";
      invoice: string;
      source: "event" | "tag";
    };

const interpretZapValue = (value: string | undefined, source: ZapEndpoint["source"]) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(LIGHTNING_PREFIX)) {
    return interpretZapValue(trimmed.slice(LIGHTNING_PREFIX.length), source);
  }
  if (isBolt11(trimmed)) {
    return { type: "bolt11", invoice: trimmed, source } as ZapEndpoint;
  }
  if (trimmed.toLowerCase().startsWith("lnurl")) {
    const decoded = decodeLnurl(trimmed);
    if (decoded) {
      return { type: "lnurl", url: decoded, source, raw: trimmed } satisfies ZapEndpoint;
    }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "lnurl", url: trimmed, source, raw: trimmed } satisfies ZapEndpoint;
  }
  if (isLightningAddress(trimmed)) {
    const url = lightningAddressToLnurl(trimmed);
    if (url) {
      return { type: "lnurl", url, source, raw: trimmed, address: trimmed } satisfies ZapEndpoint;
    }
  }
  return null;
};

export const detectZapEndpoint = ({
  lightningAddress,
  tags,
}: {
  lightningAddress?: string | null;
  tags?: string[][] | null;
}): ZapEndpoint | null => {
  if (tags) {
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) continue;
      const [identifier, ...rest] = tag;
      const source: ZapEndpoint["source"] = identifier === "zap" ? "event" : "tag";
      for (const candidate of rest) {
        const endpoint = interpretZapValue(candidate, source);
        if (endpoint) {
          return endpoint;
        }
      }
    }
  }

  if (typeof lightningAddress === "string" && lightningAddress.trim().length > 0) {
    const endpoint = interpretZapValue(lightningAddress, "profile");
    if (endpoint && endpoint.type === "lnurl") {
      return endpoint;
    }
  }

  return null;
};

export const countZapReferences = (tags?: string[][] | null) => {
  if (!tags) return 0;
  return tags.reduce((total, tag) => (tag?.[0] === "zap" ? total + 1 : total), 0);
};

export interface LnurlPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  commentAllowed?: number;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

export interface ZapInvoiceResponse {
  pr: string;
  routes?: unknown[];
  disposable?: boolean;
  successAction?: {
    tag: string;
    message?: string;
    url?: string;
  };
}

export const fetchLnurlDetails = async (url: string): Promise<LnurlPayResponse> => {
  const response = await safeJsonFetch<LnurlPayResponse | { status: "ERROR"; reason: string }>(url);
  if ((response as { status?: string }).status === "ERROR") {
    const reason = (response as { reason?: string }).reason ?? "Zap endpoint returned an error.";
    throw new Error(reason);
  }
  return response as LnurlPayResponse;
};

export interface RequestZapInvoiceParams {
  details: LnurlPayResponse;
  amountMsat: number;
  targetPubkey: string;
  noteId?: string | null;
  relays?: string[];
  comment?: string;
  signEvent: ((template: EventTemplate) => Promise<{ id: string; [key: string]: unknown }>) | null;
  lnurlRaw?: string;
  logger?: Pick<Console, "warn">;
}

export interface ZapInvoiceRequestResult extends ZapInvoiceResponse {
  event?: Event;
}

export const requestZapInvoice = async ({
  details,
  amountMsat,
  targetPubkey,
  noteId,
  relays,
  comment,
  signEvent,
  lnurlRaw,
  logger,
}: RequestZapInvoiceParams): Promise<ZapInvoiceRequestResult> => {
  if (!signEvent) {
    throw new Error("Nostr signer is unavailable. Refresh and try again.");
  }

  const now = Math.floor(Date.now() / 1000);
  const tags: string[][] = [["p", targetPubkey], ["amount", amountMsat.toString()]];
  if (noteId) {
    tags.push(["e", noteId]);
  }
  if (Array.isArray(relays) && relays.length > 0) {
    tags.push(["relays", ...relays]);
  }
  if (lnurlRaw) {
    tags.push(["lnurl", lnurlRaw]);
  }

  const template: EventTemplate = {
    kind: 9734,
    created_at: now,
    tags,
    content: comment ?? "",
  };

  const signed = await signEvent(template);

  const params = new URLSearchParams();
  params.set("amount", amountMsat.toString());
  const trimmedComment = comment?.trim();
  if (trimmedComment && (details.commentAllowed ?? 0) > 0) {
    params.set("comment", trimmedComment.slice(0, details.commentAllowed ?? trimmedComment.length));
  }
  if (details.allowsNostr !== false) {
    params.set("nostr", JSON.stringify(signed));
  }

  let callbackUrl: string;
  try {
    const callback = new URL(details.callback);
    callback.search = callback.search ? `${callback.search}&${params.toString()}` : params.toString();
    callbackUrl = callback.toString();
  } catch (error) {
    logger?.warn?.("Invalid LNURL callback", error);
    throw new Error("Zap callback URL is invalid.");
  }

  const invoiceResponse = await safeJsonFetch<ZapInvoiceResponse | { status: "ERROR"; reason?: string }>(callbackUrl);
  if ((invoiceResponse as { status?: string }).status === "ERROR") {
    const reason = (invoiceResponse as { reason?: string }).reason ?? "Zap request failed.";
    throw new Error(reason);
  }
  return {
    ...(invoiceResponse as ZapInvoiceResponse),
    event: details.allowsNostr === false ? undefined : (signed as Event),
  };
};
