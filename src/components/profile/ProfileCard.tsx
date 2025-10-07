import React, { useEffect, useMemo, useState } from "react";

import { useProfileIdentity } from "../../context/ProfileIdentityContext";

interface ProfileCardProps {
  pubkey: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  interactive?: boolean;
  size?: "sm" | "md";
  trailing?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const avatarSizeClass: Record<NonNullable<ProfileCardProps["size"]>, string> = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
};

const ProfileCard: React.FC<ProfileCardProps> = ({
  pubkey,
  subtitle,
  meta,
  className = "",
  contentClassName = "",
  interactive = true,
  size = "md",
  trailing,
  onClick,
}) => {
  const { resolveProfileSummary, openProfile, requestProfile } = useProfileIdentity();
  const summary = useMemo(() => resolveProfileSummary(pubkey), [pubkey, resolveProfileSummary]);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    requestProfile(pubkey).catch(() => undefined);
  }, [pubkey, requestProfile]);

  useEffect(() => {
    setImageLoaded(false);
  }, [summary.avatarUrl]);

  const content = (
    <div className={`flex w-full items-center gap-3 ${contentClassName}`}>
      <div className={`flex-shrink-0 overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--bg-muted)] ${avatarSizeClass[size]}`}>
        <img
          src={summary.avatarUrl}
          alt={summary.displayName}
          loading="lazy"
          className={`h-full w-full object-cover transition-opacity duration-500 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setImageLoaded(true)}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-semibold text-[var(--fg-default)]">{summary.displayName}</span>
        {subtitle && <span className="truncate text-xs text-[var(--fg-muted)]">{subtitle}</span>}
      </div>
      {(meta || trailing) && (
        <div className="ml-auto flex flex-col items-end gap-1 text-xs text-[var(--fg-muted)]">
          {meta}
          {trailing}
        </div>
      )}
    </div>
  );

  if (!interactive) {
    return <div className={`group flex w-full items-center gap-3 ${className}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          openProfile(pubkey);
        }
      }}
      className={`group flex w-full items-center gap-3 rounded-xl border border-transparent bg-transparent p-0 text-left text-inherit transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${className}`}
    >
      {content}
    </button>
  );
};

export default ProfileCard;
