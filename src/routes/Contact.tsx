import React from "react";
import { useContactContent } from "../hooks/useContactContent";

export default function Contact() {
  const { content } = useContactContent();
  const socials = Array.isArray(content.socials) ? content.socials : [];
  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <h1
        className="text-3xl font-bold"
        dangerouslySetInnerHTML={{ __html: content.title }}
      />
      {content.body && (
        <div
          className="prose dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: content.body }}
        />
      )}
      {socials.length > 0 && (
        <ul className="flex gap-4 mt-4">
          {socials.map((s, i) => (
            <li key={i}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
