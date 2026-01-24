import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from 'react';
import type { Block, PartialBlock } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/react/style.css';
import { useAuth } from '../../context/AuthContext';
import { uploadToStrapi } from '../../lib/strapiUpload';

export type LessonTextBlocks = Block[];

type BlockNoteViewProps = {
  editor: ReturnType<typeof useCreateBlockNote>;
  onChange?: () => void;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
};

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

function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => extractText((item as { text?: string; content?: unknown })?.text ?? item)).join('');
  }
  if (content && typeof content === 'object') {
    const candidate = content as { text?: string; content?: unknown };
    if (typeof candidate.text === 'string') {
      return candidate.text;
    }
    if (candidate.content) {
      return extractText(candidate.content);
    }
  }
  return '';
}

function blocksToPlainText(blocks: LessonTextBlocks): string {
  return blocks
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const record = block as { content?: unknown; children?: unknown[] };
      const current = extractText(record.content);
      const children = Array.isArray(record.children)
        ? record.children.map((child) => extractText((child as { content?: unknown }).content)).join('')
        : '';
      return [current, children].filter(Boolean).join('');
    })
    .filter(Boolean)
    .join('\n');
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [BlockNoteViewComponent, setBlockNoteViewComponent] = useState<ComponentType<BlockNoteViewProps> | null>(
    null,
  );

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
    let active = true;
    import('@blocknote/react')
      .then((mod) => {
        if (!active) return;
        const candidate =
          (mod as { BlockNoteView?: ComponentType<BlockNoteViewProps> }).BlockNoteView ??
          (mod as { BlockNoteViewRaw?: ComponentType<BlockNoteViewProps> }).BlockNoteViewRaw ??
          (mod as { default?: ComponentType<BlockNoteViewProps> }).default ??
          (mod as { BlockNoteEditor?: ComponentType<BlockNoteViewProps> }).BlockNoteEditor ??
          null;
        if (!candidate) {
          setLoadError('Lesson editor failed to load. Using plain text editor instead.');
          setBlockNoteViewComponent(null);
          return;
        }
        setLoadError(null);
        setBlockNoteViewComponent(() => candidate);
      })
      .catch(() => {
        if (!active) return;
        setLoadError('Lesson editor failed to load. Using plain text editor instead.');
        setBlockNoteViewComponent(null);
      });

    return () => {
      active = false;
    };
  }, []);

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

  const fallbackValue = useMemo(() => blocksToPlainText(value), [value]);

  const handleFallbackChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange([{ type: 'paragraph', content: event.target.value }] as LessonTextBlocks);
    },
    [onChange],
  );

  return (
    <div>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{label}</label>
      )}
      <div className="mt-2 rounded-2xl border border-neutral-300 bg-white shadow-sm focus-within:border-brand dark:border-neutral-700 dark:bg-neutral-900">
        {BlockNoteViewComponent ? (
          <BlockNoteViewComponent
            editor={editor}
            onChange={handleChange}
            aria-label="Lesson text"
            className="min-h-[140px] px-4 py-3 text-neutral-900 dark:text-neutral-100"
            placeholder={placeholder ?? 'Write the lesson text...'}
          />
        ) : (
          <textarea
            value={fallbackValue}
            onChange={handleFallbackChange}
            className="min-h-[140px] w-full rounded-2xl bg-white px-4 py-3 text-sm text-neutral-900 focus:outline-none dark:bg-neutral-900 dark:text-neutral-100"
            placeholder={placeholder ?? 'Write the lesson text...'}
          />
        )}
      </div>
      {(error || uploadError || loadError) && (
        <p className="mt-2 text-xs text-red-500">{error ?? uploadError ?? loadError}</p>
      )}
    </div>
  );
}
