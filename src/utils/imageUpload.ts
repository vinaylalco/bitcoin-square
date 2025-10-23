import { rewriteImgBbUrlToProxy } from "./imageProxy";

export const SITE_UPLOAD_ENDPOINT = "/api/upload";
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_COMPRESSED_SIZE_BYTES = 1 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1080;
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65, 0.55];

export interface UploadedImageDetails {
  url: string;
  originalUrl: string;
  width?: number;
  height?: number;
  size: number;
  mimeType: string;
  digest: string;
}

const createStableImageDigest = (value: string): string => {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash1 ^= code;
    hash1 = Math.imul(hash1, 0x01000193);
    hash2 ^= code + index;
    hash2 = Math.imul(hash2, 0x01000193);
  }

  const part1 = (hash1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (hash2 >>> 0).toString(16).padStart(8, "0");
  const part3 = value.length.toString(16).padStart(8, "0");

  return `${part1}${part2}${part3}`;
};

const guessMimeTypeFromUrl = (url: string): string => {
  const extension = url.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "image/jpeg";
  }
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("We couldn't compress the image for upload."));
      },
      type,
      quality,
    );
  });

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("We couldn't read the image."));
      image.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.onerror = () => reject(new Error("We couldn't read the image."));
    reader.readAsDataURL(file);
  });

const drawImageToCanvas = (
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
) => {
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const aspectRatio = image.width / image.height;
  const targetRatio = targetWidth / targetHeight;

  let drawWidth = targetWidth;
  let drawHeight = targetHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (aspectRatio > targetRatio) {
    drawHeight = targetHeight;
    drawWidth = targetHeight * aspectRatio;
    offsetX = (targetWidth - drawWidth) / 2;
  } else {
    drawWidth = targetWidth;
    drawHeight = targetWidth / aspectRatio;
    offsetY = (targetHeight - drawHeight) / 2;
  }

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
};

const createOptimizedImageFile = async (file: File): Promise<File> => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  const imageElement = await loadImage(file);
  const largestSide = Math.max(imageElement.width, imageElement.height);
  const scale = largestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestSide : 1;
  const targetWidth = Math.max(1, Math.round(imageElement.width * scale));
  const targetHeight = Math.max(1, Math.round(imageElement.height * scale));

  const canvas = document.createElement("canvas");
  drawImageToCanvas(imageElement, canvas, targetWidth, targetHeight);

  const candidateTypes = Array.from(new Set([file.type, "image/webp", "image/jpeg"])).filter(
    (type): type is string => typeof type === "string" && type.trim().length > 0,
  );

  let bestBlob: Blob | null = null;
  let bestType: string | null = null;

  for (const candidateType of candidateTypes) {
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, candidateType, quality);
      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
        bestType = candidateType;
      }
      if (blob.size <= MAX_COMPRESSED_SIZE_BYTES) {
        const extension = candidateType.split("/").pop() ?? "jpg";
        return new File([blob], replaceFileExtension(file.name, extension), {
          type: candidateType,
          lastModified: Date.now(),
        });
      }
    }
  }

  if (!bestBlob || !bestType) {
    throw new Error("We couldn't optimize the image for upload.");
  }

  const fallbackExtension = bestType.split("/").pop() ?? "jpg";
  return new File([bestBlob], replaceFileExtension(file.name, fallbackExtension), {
    type: bestType,
    lastModified: Date.now(),
  });
};

const replaceFileExtension = (name: string, extension: string) => {
  if (!extension) return name;
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base}.${extension}`;
};

export const createPlaceholderImageDetails = (url: string): UploadedImageDetails => {
  const safeUrl = rewriteImgBbUrlToProxy(url, { absolute: true });
  return {
    url: safeUrl,
    originalUrl: url,
    width: undefined,
    height: undefined,
    size: 0,
    mimeType: guessMimeTypeFromUrl(url),
    digest: createStableImageDigest(safeUrl),
  };
};

export const validateImageFile = (file: File): string | null => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return "Only JPEG, PNG, or WebP images are supported.";
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "Images must be 5 MB or smaller.";
  }
  return null;
};

interface WorkerUploadResponse {
  success?: boolean | null;
  display_url?: string | null;
  data?: {
    display_url?: string | null;
    url?: string | null;
    width?: number | null;
    height?: number | null;
    size?: number | null;
    image?: { mime?: string | null } | null;
  } | null;
  error?: { message?: string | null } | string | null;
  status_txt?: string | null;
}

export const uploadImageViaWorker = async (
  file: File,
  endpoint: string = SITE_UPLOAD_ENDPOINT,
): Promise<UploadedImageDetails> => {
  const optimizedFile = await createOptimizedImageFile(file);

  const formData = new FormData();
  formData.append("source", optimizedFile, optimizedFile.name);
  formData.append("action", "upload");

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const payload = (await response.json()) as WorkerUploadResponse;

  const displayUrl =
    payload?.display_url ??
    payload?.data?.display_url ??
    payload?.data?.url ??
    null;

  if (!displayUrl || typeof displayUrl !== "string" || displayUrl.trim().length === 0) {
    const message =
      (typeof payload?.error === "string" ? payload.error : payload?.error?.message) ??
      payload?.status_txt ??
      "We couldn't retrieve the uploaded image URL.";
    throw new Error(message);
  }

  const proxiedUrl = rewriteImgBbUrlToProxy(displayUrl, { absolute: true });
  const width = typeof payload?.data?.width === "number" ? payload?.data?.width : undefined;
  const height = typeof payload?.data?.height === "number" ? payload?.data?.height : undefined;
  const size = typeof payload?.data?.size === "number" ? payload?.data?.size : optimizedFile.size;
  const mimeTypeCandidate = payload?.data?.image?.mime;
  const mimeType =
    (typeof mimeTypeCandidate === "string" && mimeTypeCandidate.trim().length > 0
      ? mimeTypeCandidate.trim()
      : optimizedFile.type || guessMimeTypeFromUrl(displayUrl)) || "image/jpeg";

  return {
    url: proxiedUrl,
    originalUrl: displayUrl,
    width,
    height,
    size,
    mimeType,
    digest: createStableImageDigest(proxiedUrl),
  };
};
