import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { uploadToStrapi } from '../../lib/strapiUpload';

export type StrapiMedia = {
  url: string;
  alternativeText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
};

export type RichTextChild = {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type RichTextLink = {
  type: 'link';
  url: string;
  children: RichTextChild[];
};

export type RichTextInline = RichTextChild | RichTextLink;

export type RichTextParagraphBlock = {
  type: 'paragraph';
  children: RichTextInline[];
};

export type RichTextHeadingBlock = {
  type: 'heading';
  level: 1 | 2 | 3;
  children: RichTextInline[];
};

export type RichTextListItemBlock = {
  type: 'list-item';
  children: RichTextInline[];
};

export type RichTextListBlock = {
  type: 'list';
  format: 'ordered' | 'unordered';
  children: RichTextListItemBlock[];
};

export type RichTextImageBlock = {
  type: 'image';
  image: StrapiMedia;
  children: RichTextChild[];
};

export type RichTextBlock =
  | RichTextParagraphBlock
  | RichTextHeadingBlock
  | RichTextListBlock
  | RichTextListItemBlock
  | RichTextImageBlock;

export type LessonTextBlocks = RichTextBlock[];

type LessonTextBlocksEditorProps = {
  value: LessonTextBlocks;
  onChange: (nextBlocks: LessonTextBlocks) => void;
  label?: string;
  error?: string | null;
  placeholder?: string;
};

const DEFAULT_BLOCKS: LessonTextBlocks = [
  {
    type: 'paragraph',
    children: [{ type: 'text', text: '' }],
  },
];

const ToolbarButton = ({
  children,
  onMouseDown,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaLabel: string;
}) => (
  <button
    type="button"
    onMouseDown={onMouseDown}
    disabled={disabled}
    aria-label={ariaLabel}
    className={`rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 dark:border-neutral-700 dark:text-neutral-200 ${
      disabled ? 'opacity-50' : ''
    }`}
  >
    {children}
  </button>
);

export default function LessonTextBlocksEditor({
  value,
  onChange,
  label,
  error,
  placeholder,
}: LessonTextBlocksEditorProps) {
  const { token } = useAuth();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSyncingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const normalizedValue = useMemo(() => (value.length > 0 ? value : DEFAULT_BLOCKS), [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = blocksToHtml(normalizedValue);
    if (isFocusedRef.current) {
      return;
    }
    if (editor.innerHTML !== nextHtml) {
      isSyncingRef.current = true;
      editor.innerHTML = nextHtml;
    }
  }, [normalizedValue]);

  const syncBlocks = useCallback(() => {
    if (isSyncingRef.current) {
      isSyncingRef.current = false;
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    onChange(parseBlocksFromEditor(editor));
  }, [onChange]);

  const handleCommand = useCallback((command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    syncBlocks();
  }, [syncBlocks]);

  const insertImage = useCallback(
    async (file: File) => {
      if (!token) {
        setUploadError('You must be signed in to upload images.');
        return;
      }
      setUploading(true);
      try {
        const media = await uploadToStrapi(file, token);
        const editor = editorRef.current;
        if (!editor) return;
        insertImageNode(editor, media);
        setUploadError(null);
        syncBlocks();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Image upload failed.';
        setUploadError(message);
      } finally {
        setUploading(false);
      }
    },
    [syncBlocks, token],
  );

  return (
    <div>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{label}</label>
      )}
      <div className="mt-2 rounded-2xl border border-neutral-300 bg-white shadow-sm focus-within:border-brand dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <ToolbarButton ariaLabel="Bold" onMouseDown={(event) => {
            event.preventDefault();
            handleCommand('bold');
          }}>
            Bold
          </ToolbarButton>
          <ToolbarButton ariaLabel="Italic" onMouseDown={(event) => {
            event.preventDefault();
            handleCommand('italic');
          }}>
            Italic
          </ToolbarButton>
          <ToolbarButton ariaLabel="Heading 1" onMouseDown={(event) => {
            event.preventDefault();
            handleCommand('formatBlock', 'h1');
          }}>
            H1
          </ToolbarButton>
          <ToolbarButton ariaLabel="Heading 2" onMouseDown={(event) => {
            event.preventDefault();
            handleCommand('formatBlock', 'h2');
          }}>
            H2
          </ToolbarButton>
          <ToolbarButton ariaLabel="Heading 3" onMouseDown={(event) => {
            event.preventDefault();
            handleCommand('formatBlock', 'h3');
          }}>
            H3
          </ToolbarButton>
          <ToolbarButton ariaLabel="Bullet list" onMouseDown={(event) => {
            event.preventDefault();
            handleCommand('insertUnorderedList');
          }}>
            Bullets
          </ToolbarButton>
          <ToolbarButton ariaLabel="Numbered list" onMouseDown={(event) => {
            event.preventDefault();
            handleCommand('insertOrderedList');
          }}>
            Numbered
          </ToolbarButton>
          <ToolbarButton ariaLabel="Insert link" onMouseDown={(event) => {
            event.preventDefault();
            const url = window.prompt('Enter URL');
            if (url) {
              handleCommand('createLink', url);
            }
          }}>
            Link
          </ToolbarButton>
          <ToolbarButton
            ariaLabel="Insert image"
            disabled={uploading}
            onMouseDown={(event) => {
              event.preventDefault();
              fileInputRef.current?.click();
            }}
          >
            {uploading ? 'Uploading…' : 'Image'}
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) {
                void insertImage(file);
              }
            }}
          />
        </div>
        <div
          ref={editorRef}
          className="prose prose-sm prose-neutral min-h-[140px] max-w-none px-4 py-3 text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-brand/40 dark:prose-invert dark:text-neutral-100 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-headings:font-semibold prose-headings:tracking-tight"
          aria-label="Lesson text"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder ?? 'Write the lesson text...'}
          onInput={syncBlocks}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={() => {
            isFocusedRef.current = false;
            syncBlocks();
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
              event.preventDefault();
              handleCommand('bold');
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
              event.preventDefault();
              handleCommand('italic');
            }
          }}
        />
      </div>
      {(error || uploadError) && (
        <p className="mt-2 text-xs text-red-500">{error ?? uploadError}</p>
      )}
    </div>
  );
}

function blocksToHtml(blocks: LessonTextBlocks): string {
  return blocks.map((block) => blockToHtml(block)).join('') || '<p></p>';
}

function blockToHtml(block: RichTextBlock): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}>${inlineToHtml(block.children)}</h${block.level}>`;
    case 'list':
      return block.format === 'ordered'
        ? `<ol>${block.children.map((item) => `<li>${inlineToHtml(item.children)}</li>`).join('')}</ol>`
        : `<ul>${block.children.map((item) => `<li>${inlineToHtml(item.children)}</li>`).join('')}</ul>`;
    case 'image':
      return imageToHtml(block.image);
    case 'paragraph':
    default:
      return `<p>${inlineToHtml(block.children)}</p>`;
  }
}

function inlineToHtml(inline: RichTextInline[]): string {
  return inline
    .map((child) => {
      if (child.type === 'link') {
        return `<a href="${escapeHtml(child.url)}">${inlineToHtml(child.children)}</a>`;
      }
      let text = escapeHtml(child.text);
      if (child.bold) {
        text = `<strong>${text}</strong>`;
      }
      if (child.italic) {
        text = `<em>${text}</em>`;
      }
      return text || '<br>';
    })
    .join('');
}

function imageToHtml(image: StrapiMedia): string {
  const alt = escapeHtml(image.alternativeText ?? '');
  const caption = image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : '';
  const width = image.width ? ` data-width="${image.width}"` : '';
  const height = image.height ? ` data-height="${image.height}"` : '';
  return `<figure data-strapi-image="true"><img src="${escapeHtml(image.url)}" alt="${alt}"${width}${height} />${caption}</figure>`;
}

function parseBlocksFromEditor(editor: HTMLElement): LessonTextBlocks {
  const blocks: LessonTextBlocks = [];
  const nodes = Array.from(editor.childNodes);
  nodes.forEach((node) => {
    const parsed = parseBlockNode(node);
    if (parsed) {
      if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      } else {
        blocks.push(parsed);
      }
    }
  });
  return blocks.length > 0 ? blocks : DEFAULT_BLOCKS;
}

function parseBlockNode(node: ChildNode): RichTextBlock | RichTextBlock[] | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim() ?? '';
    if (!text) return null;
    return {
      type: 'paragraph',
      children: [{ type: 'text', text }],
    };
  }

  if (!(node instanceof HTMLElement)) return null;

  switch (node.tagName.toLowerCase()) {
    case 'p':
    case 'div':
      return {
        type: 'paragraph',
        children: parseInlineNodes(node) || [{ type: 'text', text: '' }],
      };
    case 'h1':
    case 'h2':
    case 'h3': {
      const level = Number(node.tagName.replace('H', '')) as 1 | 2 | 3;
      return {
        type: 'heading',
        level,
        children: parseInlineNodes(node) || [{ type: 'text', text: '' }],
      };
    }
    case 'ul':
    case 'ol':
      return {
        type: 'list',
        format: node.tagName.toLowerCase() === 'ol' ? 'ordered' : 'unordered',
        children: Array.from(node.querySelectorAll(':scope > li')).map((li) => ({
          type: 'list-item',
          children: parseInlineNodes(li) || [{ type: 'text', text: '' }],
        })),
      };
    case 'figure':
      return parseImageBlock(node);
    case 'img':
      return parseImageBlock(node);
    case 'br':
      return {
        type: 'paragraph',
        children: [{ type: 'text', text: '' }],
      };
    default:
      return {
        type: 'paragraph',
        children: parseInlineNodes(node) || [{ type: 'text', text: '' }],
      };
  }
}

function parseInlineNodes(container: HTMLElement, marks: { bold?: boolean; italic?: boolean } = {}): RichTextInline[] {
  const children: RichTextInline[] = [];

  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      children.push({ type: 'text', text, ...marks });
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName.toLowerCase();
    if (tag === 'strong' || tag === 'b') {
      children.push(...parseInlineNodes(node, { ...marks, bold: true }));
      return;
    }
    if (tag === 'em' || tag === 'i') {
      children.push(...parseInlineNodes(node, { ...marks, italic: true }));
      return;
    }
    if (tag === 'a') {
      const url = node.getAttribute('href') ?? '';
      children.push({
        type: 'link',
        url,
        children: parseInlineNodes(node, marks).filter(isTextNode) || [{ type: 'text', text: '' }],
      });
      return;
    }
    if (tag === 'br') {
      children.push({ type: 'text', text: '\n', ...marks });
      return;
    }

    children.push(...parseInlineNodes(node, marks));
  });

  return children;
}

function isTextNode(node: RichTextInline): node is RichTextChild {
  return node.type === 'text';
}

function parseImageBlock(element: HTMLElement): RichTextImageBlock | null {
  const imageElement = element.tagName.toLowerCase() === 'img' ? element : element.querySelector('img');
  if (!imageElement) return null;
  const url = imageElement.getAttribute('src') ?? '';
  if (!url) return null;
  const alternativeText = imageElement.getAttribute('alt');
  const captionElement = element.tagName.toLowerCase() === 'figure' ? element.querySelector('figcaption') : null;
  const caption = captionElement?.textContent ?? null;
  const width = imageElement.getAttribute('data-width');
  const height = imageElement.getAttribute('data-height');
  return {
    type: 'image',
    image: {
      url,
      alternativeText,
      caption,
      width: width ? Number(width) : null,
      height: height ? Number(height) : null,
    },
    children: [{ type: 'text', text: '' }],
  };
}

function insertImageNode(editor: HTMLElement, media: StrapiMedia) {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const figure = document.createElement('figure');
  const img = document.createElement('img');
  img.src = media.url;
  img.alt = media.alternativeText ?? '';
  if (media.width) {
    img.setAttribute('data-width', String(media.width));
  }
  if (media.height) {
    img.setAttribute('data-height', String(media.height));
  }
  figure.appendChild(img);
  if (media.caption) {
    const figcaption = document.createElement('figcaption');
    figcaption.textContent = media.caption;
    figure.appendChild(figcaption);
  }

  if (range) {
    range.deleteContents();
    range.insertNode(figure);
    range.setStartAfter(figure);
    range.setEndAfter(figure);
    selection?.removeAllRanges();
    selection?.addRange(range);
  } else {
    editor.appendChild(figure);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
