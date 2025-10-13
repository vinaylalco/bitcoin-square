import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RoomDefinition } from "../components/RoomList";
import { nostrClient } from "../lib/nostrClient";
import { getCachedPreview, setCachedMediaBlob, setCachedPreview } from "../utils/mediaCache";
import { assertCryptoAvailable, useRoomKey } from "./useRoomKey";
import { CASUAL_ROOM_ID } from "./useBitcoinSquareCasualChat";

type MediaUploaderStatus = "idle" | "uploading" | "success" | "error";

interface MediaDimensions {
  width?: number;
  height?: number;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  error?: string;
  digest?: string;
  buffer?: ArrayBuffer;
  originalBuffer?: ArrayBuffer;
  mimeType?: string;
  size?: number;
  iv?: Uint8Array;
  previewDataUrl?: string;
  width?: number;
  height?: number;
}

interface UploadCacheEntry {
  url: string;
  eventId: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  digest: string;
  iv?: string;
  previewUrl?: string | null;
}

export interface MediaUploadResult extends UploadCacheEntry {
  cacheKey: string;
}

export interface UseMediaUploaderOptions {
  room: RoomDefinition | null;
  pubkey: string | null;
  host?: "void.cat" | "nostr.build";
}

export interface UseMediaUploaderReturn {
  uploadFile: (file: File) => Promise<MediaUploadResult>;
  progress: number;
  status: MediaUploaderStatus;
  eventId: string | null;
  previewUrl: string | null;
  error: string | null;
  reset: () => void;
}

const uploadCache = new Map<string, UploadCacheEntry>();

const uint8ToBase64 = (value: Uint8Array) => {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToArrayBuffer = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Encryption key cannot be empty");
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const getMediaDimensions = async (blob: Blob, mimeType: string): Promise<MediaDimensions> => {
  if (typeof window === "undefined") return {};

  if (mimeType.startsWith("image/")) {
    return new Promise<MediaDimensions>((resolve) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      image.src = url;
    });
  }

  if (mimeType.startsWith("video/")) {
    return new Promise<MediaDimensions>((resolve) => {
      const url = URL.createObjectURL(blob);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      video.src = url;
    });
  }

  return {};
};

const parseUploadUrl = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.url === "string") {
    return candidate.url;
  }

  if (typeof candidate.download_url === "string") {
    return candidate.download_url;
  }

  if (candidate.file && typeof (candidate.file as Record<string, unknown>).url === "string") {
    return (candidate.file as Record<string, unknown>).url as string;
  }

  if (Array.isArray(candidate.data) && candidate.data.length > 0) {
    const entry = candidate.data[0];
    if (entry && typeof (entry as Record<string, unknown>).url === "string") {
      return (entry as Record<string, unknown>).url as string;
    }
  }

  if (typeof candidate.id === "string" && typeof candidate.host === "string") {
    return `${candidate.host.replace(/\/$/, "")}/${candidate.id}`;
  }

  return null;
};

type UploadHost = "void.cat" | "nostr.build";

interface UploadHostConfig {
  defaultEndpoint: string;
  fieldName: string;
  label: string;
}

interface UploadHostError extends Error {
  host: UploadHost;
  endpoint: string;
  details?: string;
}

const UPLOAD_HOST_CONFIG: Record<UploadHost, UploadHostConfig> = {
  "nostr.build": {
    defaultEndpoint: "https://nostr.build/api/v2/upload/files",
    fieldName: "fileToUpload",
    label: "nostr.build",
  },
  "void.cat": {
    defaultEndpoint: "https://void.cat/upload",
    fieldName: "file",
    label: "void.cat",
  },
};

const DEFAULT_UPLOAD_HOSTS: UploadHost[] = ["nostr.build", "void.cat"];

const isUploadHost = (value: string): value is UploadHost => value === "nostr.build" || value === "void.cat";

const parseHostList = (value?: string): UploadHost[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is UploadHost => isUploadHost(entry));
};

const configuredHostOrder = parseHostList(import.meta.env.VITE_MEDIA_UPLOAD_HOSTS);

const buildHostOrder = (preferred: UploadHost): UploadHost[] => {
  const order: UploadHost[] = [];
  const append = (host: UploadHost) => {
    if (!order.includes(host)) {
      order.push(host);
    }
  };

  append(preferred);
  configuredHostOrder.forEach(append);
  DEFAULT_UPLOAD_HOSTS.forEach(append);

  return order;
};

const getUploadEndpoint = (host: UploadHost) => {
  const override =
    host === "nostr.build"
      ? import.meta.env.VITE_MEDIA_UPLOAD_ENDPOINT_NOSTR_BUILD
      : import.meta.env.VITE_MEDIA_UPLOAD_ENDPOINT_VOID_CAT;
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  return UPLOAD_HOST_CONFIG[host].defaultEndpoint;
};

const createUploadError = (host: UploadHost, message: string, details?: string, cause?: unknown): UploadHostError => {
  const error = new Error(message) as UploadHostError & { cause?: unknown };
  error.host = host;
  error.endpoint = getUploadEndpoint(host);
  if (details) {
    error.details = details;
  }
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
};

const uploadToHost = async (
  blob: Blob,
  fileName: string,
  host: UploadHost,
  onProgress: (progress: number) => void,
) =>
  new Promise<{ url: string; raw: unknown }>((resolve, reject) => {
    const { fieldName } = UPLOAD_HOST_CONFIG[host];
    const endpoint = getUploadEndpoint(host);
    const formData = new FormData();
    formData.append(fieldName, blob, fileName);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.responseType = "json";
    xhr.timeout = 45000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onerror = () => {
      reject(createUploadError(host, "Network request failed"));
    };

    xhr.onabort = () => {
      reject(createUploadError(host, "Upload was aborted"));
    };

    xhr.ontimeout = () => {
      reject(createUploadError(host, "Upload request timed out"));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const statusText = xhr.statusText ? ` ${xhr.statusText}` : "";
        const responseText = typeof xhr.responseText === "string" && xhr.responseText
          ? xhr.responseText.slice(0, 200)
          : undefined;
        reject(
          createUploadError(
            host,
            `HTTP ${xhr.status}${statusText}`.trim(),
            responseText,
          ),
        );
        return;
      }

      try {
        let response: unknown = xhr.response;
        if (!response && typeof xhr.responseText === "string" && xhr.responseText) {
          try {
            response = JSON.parse(xhr.responseText);
          } catch {
            response = xhr.responseText;
          }
        }

        const url = parseUploadUrl(response);
        if (!url) {
          reject(createUploadError(host, "Upload succeeded but no URL was returned by the host"));
          return;
        }
        onProgress(1);
        resolve({ url, raw: response });
      } catch (error) {
        reject(createUploadError(host, "Unexpected response from upload host", undefined, error));
      }
    };

    xhr.send(formData);
  });

const createWorker = () =>
  new Worker(new URL("../workers/mediaWorker.ts", import.meta.url), { type: "module" });

const buildCacheKey = (roomId: string, digest: string, isPrivate: boolean) =>
  `${roomId}:${isPrivate ? "1" : "0"}:${digest}`;

export const useMediaUploader = ({ room, pubkey, host = "nostr.build" }: UseMediaUploaderOptions): UseMediaUploaderReturn => {
  const roomId = room?.id ?? null;
  const isPrivate = room?.type === "private";
  const seedBase64 =
    roomId && isPrivate && roomId === CASUAL_ROOM_ID
      ? import.meta.env.VITE_CASUAL_ROOM_KEY ?? null
      : null;
  const {
    key: roomKey,
    base64: roomKeyBase64,
    ensure,
  } = useRoomKey({
    roomId,
    isPrivate: Boolean(isPrivate),
    seedBase64,
  });

  const workerRef = useRef<Worker | null>(null);

  const [status, setStatus] = useState<MediaUploaderStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setEventId(null);
    setError(null);
    setPreviewUrl((current) => {
      if (current && current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    previewRef.current = null;
  }, []);

  useEffect(() => () => {
    if (previewRef.current && previewRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(previewRef.current);
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    reset();
  }, [reset, roomId, isPrivate]);

  const runWorker = useCallback(
    async (file: File, options: { encryptKey?: ArrayBuffer; preview?: boolean }) => {
      if (typeof window === "undefined" || typeof Worker === "undefined") {
        throw new Error("Media processing is not supported in this environment");
      }

      if (!workerRef.current) {
        workerRef.current = createWorker();
      }

      const worker = workerRef.current;
      const id = crypto.randomUUID?.() ?? `media-${Math.random().toString(36).slice(2)}`;

      const response = await new Promise<WorkerResponse>((resolve, reject) => {
        const handleMessage = (event: MessageEvent<WorkerResponse>) => {
          if (!event.data || event.data.id !== id) return;
          worker.removeEventListener("message", handleMessage as EventListener);
          worker.removeEventListener("error", handleError as EventListener);
          resolve(event.data);
        };

        const handleError = (event: ErrorEvent) => {
          worker.removeEventListener("message", handleMessage as EventListener);
          reject(new Error(event.message));
        };

        worker.addEventListener("message", handleMessage as EventListener);
        worker.addEventListener("error", handleError as EventListener, { once: true });
        worker.postMessage({
          id,
          file,
          compress: file.type.startsWith("image/"),
          preview: options.preview,
          encrypt: options.encryptKey ? { key: options.encryptKey } : undefined,
        });
      });

      if (!response.success || !response.buffer || !response.digest) {
        throw new Error(response.error ?? "Media processing failed");
      }

      return response;
    },
    [],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<MediaUploadResult> => {
      if (!roomId || !room) {
        throw new Error("A room must be selected before uploading media");
      }

      if (!pubkey) {
        throw new Error("Connect a Nostr account before uploading media");
      }

      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        throw new Error("Only image and video files are supported for uploads");
      }

      setStatus("uploading");
      setProgress(0);
      setError(null);

      try {
        let cryptoKey = roomKey;
        if (isPrivate) {
          if (!cryptoKey) {
            cryptoKey = await ensure();
          }
          if (!cryptoKey) {
            throw new Error("Missing AES key for private room upload");
          }
        }

        let exportedKey: ArrayBuffer | undefined;
        if (isPrivate && cryptoKey) {
          if (roomKeyBase64) {
            exportedKey = base64ToArrayBuffer(roomKeyBase64);
          } else {
            assertCryptoAvailable();
            try {
              exportedKey = await crypto.subtle.exportKey("raw", cryptoKey);
            } catch (exportError) {
              console.warn("Failed to export room key for media encryption", exportError);
              throw new Error(
                "We couldn't prepare the encryption key for this upload. Please refresh and try again.",
              );
            }
          }
        }

        const workerResult = await runWorker(file, {
          encryptKey: exportedKey,
          preview: true,
        });

        const digest = workerResult.digest!;
        const cacheKey = buildCacheKey(roomId, digest, Boolean(isPrivate));
        const cached = uploadCache.get(cacheKey);

        if (cached) {
          setStatus("success");
          setProgress(100);
          setEventId(cached.eventId);

          const cachedPreview = await getCachedPreview(roomId, digest);
          if (cachedPreview) {
            setPreviewUrl(cachedPreview);
            previewRef.current = cachedPreview;
          }

          const preview = cachedPreview ?? cached.previewUrl ?? previewRef.current;
          if (preview) {
            cached.previewUrl = preview;
          }

          return { ...cached, cacheKey, previewUrl: preview ?? null };
        }

        const mimeType = workerResult.mimeType ?? file.type ?? "application/octet-stream";
        const payloadBlob = new Blob([workerResult.buffer!], { type: mimeType });
        const originalBuffer = workerResult.originalBuffer ?? workerResult.buffer!;
        const originalBlob = new Blob([originalBuffer], { type: file.type || mimeType });

        const hostOrder = buildHostOrder(host);
        let uploadResult: { url: string; raw: unknown } | null = null;
        const attemptErrors: UploadHostError[] = [];
        for (const candidateHost of hostOrder) {
          try {
            const result = await uploadToHost(payloadBlob, file.name, candidateHost, (value) => {
              setProgress(Math.round(value * 100));
            });
            uploadResult = result;
            break;
          } catch (attemptError) {
            const normalizedError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
            const uploadError =
              normalizedError instanceof Error && "host" in normalizedError
                ? (normalizedError as UploadHostError)
                : createUploadError(candidateHost, normalizedError.message, undefined, normalizedError);
            attemptErrors.push(uploadError);
            console.warn(`Upload to ${candidateHost} failed`, normalizedError);
            setProgress(0);
          }
        }

        if (!uploadResult) {
          if (attemptErrors.length > 0) {
            const details = attemptErrors
              .map((error) => {
                const label = UPLOAD_HOST_CONFIG[error.host].label;
                const info = error.details ? `${error.message} (${error.details})` : error.message;
                return `${label} — ${info}`;
              })
              .join("; ");
            throw new Error(
              `We couldn't upload your media right now. Upload attempts: ${details}. Please try again later.`,
            );
          }

          throw new Error("We couldn't upload your media right now. Please try again later.");
        }

        const now = Math.floor(Date.now() / 1000);
        const dimensions =
          workerResult.width && workerResult.height
            ? { width: workerResult.width, height: workerResult.height }
            : await getMediaDimensions(originalBlob, file.type || mimeType);

        const tags: string[][] = [
          ["url", uploadResult.url],
          ["m", file.type || mimeType],
          ["size", String(payloadBlob.size)],
          ["t", `room:${roomId}`],
          ["x", digest],
        ];

        if (dimensions.width && dimensions.height) {
          tags.push(["dim", `${dimensions.width}x${dimensions.height}`]);
        }

        let ivBase64: string | undefined;
        if (isPrivate && workerResult.iv) {
          ivBase64 = uint8ToBase64(workerResult.iv);
          tags.push(["iv", ivBase64]);
        }

        const eventTemplate = {
          kind: 1063,
          created_at: now,
          content: "",
          tags,
        } as const;

        const signedEvent = await nostrClient.publish(eventTemplate);

        const previewFromWorker = workerResult.previewDataUrl ?? null;

        const result: UploadCacheEntry = {
          url: uploadResult.url,
          eventId: signedEvent.id,
          mimeType: file.type || mimeType,
          size: payloadBlob.size,
          width: dimensions.width,
          height: dimensions.height,
          digest,
          iv: ivBase64,
          previewUrl: previewFromWorker,
        };

        uploadCache.set(cacheKey, result);

        if (workerResult.previewDataUrl) {
          await setCachedPreview(roomId, digest, workerResult.previewDataUrl);
          setPreviewUrl(workerResult.previewDataUrl);
          previewRef.current = workerResult.previewDataUrl;
        } else {
          const fallbackPreview = URL.createObjectURL(originalBlob);
          previewRef.current = fallbackPreview;
          setPreviewUrl(fallbackPreview);
        }

        await setCachedMediaBlob(roomId, digest, originalBlob);

        setStatus("success");
        setProgress(100);
        setEventId(signedEvent.id);

        const preview = previewRef.current ?? result.previewUrl ?? null;
        return { ...result, cacheKey, previewUrl: preview };
      } catch (uploadError) {
        console.error("Media upload failed", uploadError);
        setStatus("error");
        const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
        setError(message);
        setProgress(0);
        throw uploadError;
      }
    },
    [ensure, host, isPrivate, pubkey, room, roomId, roomKey, runWorker],
  );

  return useMemo(
    () => ({ uploadFile, progress, status, eventId, previewUrl, error, reset }),
    [error, eventId, previewUrl, progress, reset, status, uploadFile],
  );
};

