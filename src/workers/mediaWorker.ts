interface ProcessMediaRequest {
  id: string;
  file: File;
  compress?: boolean;
  encrypt?: {
    key: ArrayBuffer;
  };
  preview?: boolean;
}

interface ProcessMediaResponse {
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

const arrayBufferToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const blobToArrayBuffer = async (blob: Blob) => blob.arrayBuffer();

const compressImage = async (file: File): Promise<Blob> => {
  if (typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1920;
    const largestSide = Math.max(bitmap.width, bitmap.height);
    if (largestSide <= maxDimension) {
      return file;
    }
    const scale = maxDimension / largestSide;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({
      type: file.type || "image/jpeg",
      quality: 0.85,
    });
    return blob ?? file;
  } catch (error) {
    console.warn("Image compression failed", error);
    return file;
  }
};

const createPreview = async (blob: Blob): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const maxDimension = 320;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const previewBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
    const reader = new FileReaderSync();
    const dataUrl = reader.readAsDataURL(previewBlob);
    return { dataUrl, width: bitmap.width, height: bitmap.height };
  } catch (error) {
    console.warn("Failed to create preview", error);
    return null;
  }
};

const processMedia = async (request: ProcessMediaRequest): Promise<ProcessMediaResponse> => {
  try {
    let workingFile: File | Blob = request.file;
    const mimeType = request.file.type || "application/octet-stream";

    if (request.compress && mimeType.startsWith("image/")) {
      workingFile = await compressImage(request.file);
    }

    const buffer = await blobToArrayBuffer(workingFile);
    const digestBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const digest = arrayBufferToHex(digestBuffer);

    let outputBuffer = buffer;
    let outputMime = (workingFile as File).type || mimeType;
    let iv: Uint8Array | undefined;

    if (request.encrypt?.key) {
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        request.encrypt.key,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"],
      );
      iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, buffer);
      outputBuffer = encrypted;
      outputMime = "application/octet-stream";
    }

    let previewDataUrl: string | undefined;
    let width: number | undefined;
    let height: number | undefined;

    if (request.preview && mimeType.startsWith("image/")) {
      const preview = await createPreview(workingFile);
      if (preview) {
        previewDataUrl = preview.dataUrl;
        width = preview.width;
        height = preview.height;
      }
    }

    return {
      id: request.id,
      success: true,
      digest,
      buffer: outputBuffer,
      originalBuffer: buffer,
      mimeType: outputMime,
      size: outputBuffer.byteLength,
      iv,
      previewDataUrl,
      width,
      height,
    };
  } catch (error) {
    return {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

self.addEventListener("message", (event: MessageEvent<ProcessMediaRequest>) => {
  const request = event.data;
  if (!request || typeof request !== "object") return;
  processMedia(request)
    .then((response) => {
      if (response.buffer) {
        const transfer: Transferable[] = [response.buffer];
        if (response.originalBuffer && response.originalBuffer !== response.buffer) {
          transfer.push(response.originalBuffer);
        }
        if (response.iv) {
          transfer.push(response.iv.buffer);
        }
        (self as unknown as WorkerGlobalScope).postMessage(response, transfer);
      } else {
        (self as unknown as WorkerGlobalScope).postMessage(response);
      }
    })
    .catch((error: unknown) => {
      const response: ProcessMediaResponse = {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      (self as unknown as WorkerGlobalScope).postMessage(response);
    });
});
