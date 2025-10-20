const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1080;
const API_ENDPOINT = "https://freeimage.host/api/1/upload";
const API_KEY = "6d207e02198a847aa98d0a2a901485a5";

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  size: number;
  digest: string;
  previewDataUrl: string;
  fileName: string;
}

export interface UploadedImage {
  url: string;
  displayUrl: string;
  viewerUrl: string;
  thumbUrl?: string | null;
  width: number;
  height: number;
  size: number;
  mimeType: string;
  digest: string;
  name: string;
}

export class ImageProcessingError extends Error {}

const arrayBufferToHex = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const hex: string[] = [];
  bytes.forEach((byte) => {
    hex.push(byte.toString(16).padStart(2, "0"));
  });
  return hex.join("");
};

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new ImageProcessingError("Failed to read image data"));
      }
    };
    reader.onerror = () => {
      reject(new ImageProcessingError("Unable to read image data"));
    };
    reader.readAsDataURL(blob);
  });

const getImageBitmap = async (file: Blob): Promise<ImageBitmap | null> => {
  if (typeof window === "undefined") return null;
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch (error) {
      console.warn("createImageBitmap failed, falling back to HTMLImageElement", error);
    }
  }

  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new ImageProcessingError("Unable to create rendering context"));
          return;
        }
        context.drawImage(image, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new ImageProcessingError("Unable to rasterize image"));
            return;
          }
          createImageBitmap(blob)
            .then((bitmap) => {
              resolve(bitmap);
            })
            .catch((bitmapError) => {
              reject(bitmapError);
            });
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageProcessingError("Unable to load image"));
    };
    image.src = url;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImageProcessingError("Unable to encode image"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });

const sanitizeFileName = (name: string) => {
  const base = name.replace(/\.[^.]+$/, "");
  const sanitized = base.replace(/[^a-zA-Z0-9-_]+/g, "-");
  return sanitized || "bitcoin-square-image";
};

export const processImageFile = async (file: File): Promise<ProcessedImage> => {
  if (!file.type.startsWith("image/")) {
    throw new ImageProcessingError("Only image files are supported");
  }

  const bitmap = await getImageBitmap(file);
  if (!bitmap) {
    throw new ImageProcessingError("Unable to read image");
  }

  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImageProcessingError("Unable to prepare canvas for resizing");
  }
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  let quality = 0.9;
  let encoded = await canvasToBlob(canvas, quality);

  while (encoded.size > MAX_IMAGE_BYTES && quality > 0.45) {
    quality -= 0.1;
    encoded = await canvasToBlob(canvas, quality);
  }

  if (encoded.size > MAX_IMAGE_BYTES) {
    throw new ImageProcessingError("Image is too large even after compression (max 5 MB)");
  }

  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.7);
  const arrayBuffer = await encoded.arrayBuffer();
  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const digest = arrayBufferToHex(digestBuffer);

  return {
    blob: encoded,
    width: targetWidth,
    height: targetHeight,
    mimeType: "image/jpeg",
    size: encoded.size,
    digest,
    previewDataUrl,
    fileName: `${sanitizeFileName(file.name)}.jpg`,
  };
};

const buildUploadUrl = () => `${API_ENDPOINT}?key=${API_KEY}&action=upload&format=json`;

export const uploadProcessedImage = async (processed: ProcessedImage): Promise<UploadedImage> => {
  const dataUrl = await readAsDataUrl(processed.blob);
  const base64 = dataUrl.split(",")[1];
  if (!base64) {
    throw new ImageProcessingError("Unable to prepare image for upload");
  }

  const formData = new FormData();
  formData.append("image", base64);
  formData.append("name", sanitizeFileName(processed.fileName));

  const response = await fetch(buildUploadUrl(), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new ImageProcessingError(`Upload failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new ImageProcessingError("Unexpected upload response");
  }

  if (payload.status_code !== 200 || !payload.success) {
    const errorMessage =
      (payload.error && typeof payload.error.message === "string" && payload.error.message) ||
      "Image upload failed";
    throw new ImageProcessingError(errorMessage);
  }

  const image = payload.image ?? {};
  const width = typeof image.width === "number" ? image.width : Number.parseInt(image.width ?? "", 10);
  const height = typeof image.height === "number" ? image.height : Number.parseInt(image.height ?? "", 10);
  const size = typeof image.size === "number" ? image.size : Number.parseInt(image.size ?? "", 10);

  return {
    url: image.url ?? image.display_url ?? image.url_viewer,
    displayUrl: image.display_url ?? image.url,
    viewerUrl: image.url_viewer ?? image.display_url ?? image.url,
    thumbUrl: image.thumb?.url ?? null,
    width: Number.isFinite(width) ? (width as number) : processed.width,
    height: Number.isFinite(height) ? (height as number) : processed.height,
    size: Number.isFinite(size) ? (size as number) : processed.size,
    mimeType: processed.mimeType,
    digest: processed.digest,
    name: image.name ?? processed.fileName,
  };
};

export class UploadError extends ImageProcessingError {}

export const MAX_COMPRESSED_SIZE = MAX_IMAGE_BYTES;
export const MAX_WIDTH = MAX_IMAGE_WIDTH;
