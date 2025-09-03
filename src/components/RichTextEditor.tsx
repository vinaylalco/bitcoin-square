import React, { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  className?: string;
}

export default function RichTextEditor({ value, onChange, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={className}
      onInput={() => onChange(ref.current?.innerHTML || "")}
    />
  );
}
