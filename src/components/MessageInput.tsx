import React, { useCallback, useState } from "react";

interface MessageInputProps {
  onSend: (text: string) => Promise<void>;
  onTyping?: () => void;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSend, onTyping, disabled }) => {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setIsSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setIsSending(false);
    }
  }, [disabled, onSend, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onTyping?.();
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled || isSending}
        rows={2}
        placeholder={disabled ? "Connect with Nostr to start chatting" : "Message"}
        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-sm leading-relaxed text-[var(--fg-default)] shadow-sm focus:border-brand focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--fg-muted)]">
          Press Enter to send • Shift + Enter for new line
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || isSending || value.trim().length === 0}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
};

export default MessageInput;
