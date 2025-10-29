import { uploadImageViaWorker } from '../utils/imageUpload';

export interface UploadMediaResult {
  id: number | null;
  url: string;
  raw: unknown;
}

export const uploadProfileAvatar = async (file: File): Promise<UploadMediaResult> => {
  const uploaded = await uploadImageViaWorker(file);

  return {
    id: null,
    url: uploaded.url,
    raw: uploaded,
  };
};

