import { rewriteImgBbUrlToProxy } from "./imageProxy";

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(((?:https?:\/\/[^\s)]+|\/?api\/img\/[^\s)]+))\)/g;
const IMAGE_PLACEHOLDER_TOKEN_PATTERN = /__IMAGE_PLACEHOLDER_\d+__/g;
const MARKDOWN_UPLOADED_IMAGE_LINE_PATTERN =
  /^\s*!\[(?:uploaded image|image placeholder(?:\s*\d+)?|image)\]\(((?:https?:\/\/[^\s)]+|\/?api\/img\/[^\s)]+))\)\s*$/gim;
const RENDERED_PLACEHOLDER_HTML_PATTERN = /<strong>IMAGE<em>PLACEHOLDER<\/em>\d+<\/strong>/gi;
const BARE_PLACEHOLDER_PATTERN = /IMAGE[_\s]?PLACEHOLDER[_\s]?\d+/gi;

export const stripImagePlaceholders = (value: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  return value
    .replace(IMAGE_PLACEHOLDER_TOKEN_PATTERN, "")
    .replace(MARKDOWN_UPLOADED_IMAGE_LINE_PATTERN, "")
    .replace(RENDERED_PLACEHOLDER_HTML_PATTERN, "")
    .replace(BARE_PLACEHOLDER_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n");
};

export const extractMarkdownImageUrls = (markdown: string): string[] => {
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return [];
  }

  const urls = new Set<string>();
  const matcher = new RegExp(MARKDOWN_IMAGE_PATTERN.source, "g");
  let match: RegExpExecArray | null = null;
  while ((match = matcher.exec(markdown)) !== null) {
    const url = match[2];
    if (typeof url === "string" && url.trim().length > 0) {
      urls.add(url.trim());
    }
  }
  return Array.from(urls);
};

export const markdownToHtml = (input: string): string => {
  const escaped = escapeHtml(input);

  const imagePlaceholders: string[] = [];
  const withImagePlaceholders = escaped.replace(
    MARKDOWN_IMAGE_PATTERN,
    (_, rawAlt: string, rawUrl: string) => {
      const safeUrl = rewriteImgBbUrlToProxy(rawUrl, { absolute: true });
      const altText = rawAlt && rawAlt.trim().length > 0 ? rawAlt : "Uploaded image";
      const placeholder = `__IMAGE_PLACEHOLDER_${imagePlaceholders.length}__`;
      imagePlaceholders.push(
        `<img src="${safeUrl}" alt="${altText}" loading="lazy" class="max-w-full rounded-lg" />`,
      );
      return placeholder;
    },
  );

  const withBlockquotes = withImagePlaceholders.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  const withHeaders = withBlockquotes.replace(/^(#{1,3})\s+(.+)$/gm, (_, hashes: string, title: string) => {
    const level = hashes.length;
    return `<h${level}>${title}</h${level}>`;
  });

  const withCode = withHeaders.replace(/`([^`]+)`/g, "<code>$1</code>");
  const withBold = withCode
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>");

  const withItalics = withBold
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");

  const withStrike = withItalics.replace(/~~(.+?)~~/g, "<del>$1</del>");

  const withLinks = withStrike.replace(
    /\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
    (match, text: string, url: string, offset: number, str: string) => {
      if (offset > 0 && str[offset - 1] === "!") {
        return match;
      }
      return `<a href="${url}" target="_blank" rel="noreferrer">${text}</a>`;
    },
  );

  const withAutoLinks = withLinks.replace(
    /(https?:\/\/[^\s<]+[^\s<\.)])/g,
    (match: string, _url: string, offset: number, str: string) => {
      const prefix = str.slice(Math.max(0, offset - 8), offset).toLowerCase();
      if (/href\s*=\s*['"]?$/.test(prefix) || /src\s*=\s*['"]?$/.test(prefix)) {
        return match;
      }
      return `<a href="${match}" target="_blank" rel="noreferrer">${match}</a>`;
    },
  );

  const withLineBreaks = withAutoLinks.replace(/\n/g, "<br />");

  const withImages = imagePlaceholders.reduce(
    (html, placeholder, index) =>
      html.replace(`__IMAGE_PLACEHOLDER_${index}__`, placeholder),
    withLineBreaks,
  );

  return stripImagePlaceholders(withImages);
};
