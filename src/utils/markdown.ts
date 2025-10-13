export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const markdownToHtml = (input: string): string => {
  const escaped = escapeHtml(input);

  const withBlockquotes = escaped.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
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

  const withLinks = withStrike
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(
      /(https?:\/\/[^\s<]+[^\s<\.)])/g,
      '<a href="$1" target="_blank" rel="noreferrer">$1</a>',
    );

  return withLinks.replace(/\n/g, "<br />");
};
