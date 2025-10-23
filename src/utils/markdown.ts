import { rewriteImgBbUrlToProxy } from "./imageProxy";

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(((?:https?:\/\/[^\s)]+|\/?api\/img\/[^\s)]+))\)/g;

export const markdownToHtml = (input: string): string => {
  const escaped = escapeHtml(input);

  const imagePlaceholders: string[] = [];
  const withImagePlaceholders = escaped.replace(
    MARKDOWN_IMAGE_REGEX,
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

  return imagePlaceholders.reduce(
    (html, placeholder, index) =>
      html.replace(`__IMAGE_PLACEHOLDER_${index}__`, placeholder),
    withLineBreaks,
  );
};
