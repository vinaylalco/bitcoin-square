import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block, PartialBlock } from '@blocknote/core';
import BlockNoteView, { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/react/style.css';
import { useAuth } from '../../context/AuthContext';
import { uploadToStrapi } from '../../lib/strapiUpload';

export type LessonTextBlocks = Block[];

type LessonTextBlocksEditorProps = {
  value: LessonTextBlocks;
  onChange: (nextBlocks: LessonTextBlocks) => void;
  label?: string;
  error?: string | null;
  placeholder?: string;
};

const DEFAULT_BLOCKS: PartialBlock[] = [
  {
    type: 'paragraph',
    content: '',
  },
];

export default function LessonTextBlocksEditor({
  value,
  onChange,
  label,
  error,
  placeholder,
}: LessonTextBlocksEditorProps) {
  const { token } = useAuth();
  const isSyncingRef = useRef(false);
  const lastSyncedRef = useRef('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const initialContentRef = useRef<PartialBlock[]>(value.length > 0 ? (value as PartialBlock[]) : DEFAULT_BLOCKS);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!token) {
        const message = 'You must be signed in to upload images.';
        setUploadError(message);
        throw new Error(message);
      }
      try {
        const media = await uploadToStrapi(file, token);
        setUploadError(null);
        return media.url;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Image upload failed.';
        setUploadError(message);
        throw err;
      }
    },
    [token],
  );

  const editor = useCreateBlockNote({
    initialContent: initialContentRef.current,
    uploadFile,
  });

  useEffect(() => {
    const serialized = JSON.stringify(value ?? []);
    if (serialized === lastSyncedRef.current) {
      return;
    }
    isSyncingRef.current = true;
    editor.replaceBlocks(editor.document, (value.length > 0 ? value : DEFAULT_BLOCKS) as PartialBlock[]);
    lastSyncedRef.current = serialized;
    isSyncingRef.current = false;
  }, [editor, value]);

  const handleChange = useCallback(() => {
    if (isSyncingRef.current) {
      return;
    }
    const nextBlocks = editor.document as LessonTextBlocks;
    lastSyncedRef.current = JSON.stringify(nextBlocks);
    onChange(nextBlocks);
  }, [editor, onChange]);

  return (
    <div>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{label}</label>
      )}
      <div className="mt-2 rounded-2xl border border-neutral-300 bg-white shadow-sm focus-within:border-brand dark:border-neutral-700 dark:bg-neutral-900">
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          aria-label="Lesson text"
          className="min-h-[140px] px-4 py-3 text-neutral-900 dark:text-neutral-100"
          placeholder={placeholder ?? 'Write the lesson text...'}
        />
      </div>
      {(error || uploadError) && (
        <p className="mt-2 text-xs text-red-500">{error ?? uploadError}</p>
      )}
    </div>
  );
}
