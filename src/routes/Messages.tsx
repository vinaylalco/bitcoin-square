import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, MessageCircle, Search } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  useDirectMessages,
  type DirectMessageEntry,
} from "../context/DirectMessageContext";
import {
  useProfileIdentity,
  type ProfileSummary,
} from "../context/ProfileIdentityContext";
import { useAuth } from "../context/AuthContext";

const formatPreview = (value: string, limit = 140) => {
  const normalized = value.trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
};

const formatTimestamp = (timestamp?: number | null) => {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();

interface ConversationListEntry {
  pubkey: string;
  summary: ProfileSummary;
  username: string;
  lastMessage: DirectMessageEntry | null;
  unreadCount: number;
  error: string | null;
  searchText: string;
}

interface KnownMember {
  pubkey: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  searchText: string;
}

const MessagesPage: React.FC = () => {
  const { conversations, openConversation, ready, error } = useDirectMessages();
  const { profiles, resolveProfileSummary, requestProfile, shortenPubkey } = useProfileIdentity();
  const [query, setQuery] = useState("");

  const normalizedQuery = normalizeSearch(query);

  useEffect(() => {
    const keys = Object.keys(conversations);
    keys.forEach((pubkey) => {
      requestProfile(pubkey).catch(() => undefined);
    });
  }, [conversations, requestProfile]);

  const conversationEntries = useMemo<ConversationListEntry[]>(() => {
    const entries: ConversationListEntry[] = Object.entries(conversations).map(
      ([pubkey, conversation]) => {
        const summary = resolveProfileSummary(pubkey);
        const profile = profiles[pubkey]?.data ?? null;
        const username = profile?.screenName ?? "";
        const lastMessage = conversation.messages.at(-1) ?? null;
        const searchText = normalizeSearch(
          `${summary.displayName} ${username ?? ""} ${shortenPubkey(pubkey)} ${pubkey}`,
        );
        return {
          pubkey,
          summary,
          username,
          lastMessage,
          unreadCount: conversation.unreadCount,
          error: conversation.error ?? null,
          searchText,
        };
      },
    );

    entries.sort((a, b) => {
      const aTimestamp = a.lastMessage?.createdAt ?? 0;
      const bTimestamp = b.lastMessage?.createdAt ?? 0;
      return bTimestamp - aTimestamp;
    });

    return entries;
  }, [conversations, profiles, resolveProfileSummary, shortenPubkey]);

  const conversationPubkeys = useMemo(
    () => new Set(conversationEntries.map((entry) => entry.pubkey)),
    [conversationEntries],
  );

  const filteredConversations = useMemo(() => {
    if (!normalizedQuery) {
      return conversationEntries;
    }
    return conversationEntries.filter((entry) => entry.searchText.includes(normalizedQuery));
  }, [conversationEntries, normalizedQuery]);

  const knownMembers = useMemo<KnownMember[]>(() => {
    const list: KnownMember[] = [];
    const seen = new Set<string>();

    Object.keys(conversations).forEach((pubkey) => {
      if (seen.has(pubkey)) {
        return;
      }
      const summary = resolveProfileSummary(pubkey);
      const profile = profiles[pubkey]?.data ?? null;
      const username = profile?.screenName ?? "";
      list.push({
        pubkey,
        displayName: summary.displayName,
        username,
        avatarUrl: summary.avatarUrl,
        searchText: normalizeSearch(
          `${summary.displayName} ${username} ${shortenPubkey(pubkey)} ${pubkey}`,
        ),
      });
      seen.add(pubkey);
    });

    Object.entries(profiles).forEach(([pubkey, entry]) => {
      if (seen.has(pubkey) || !entry.data) {
        return;
      }
      const { data } = entry;
      const displayName = data.displayName || shortenPubkey(pubkey);
      const username = data.screenName ?? "";
      list.push({
        pubkey,
        displayName,
        username,
        avatarUrl: data.avatarUrl,
        searchText: normalizeSearch(
          `${displayName} ${username} ${shortenPubkey(pubkey)} ${pubkey}`,
        ),
      });
      seen.add(pubkey);
    });

    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [conversations, profiles, resolveProfileSummary, shortenPubkey]);

  const filteredPeople = useMemo<KnownMember[]>(() => {
    if (!normalizedQuery) {
      return [];
    }
    return knownMembers.filter(
      (member) =>
        !conversationPubkeys.has(member.pubkey) && member.searchText.includes(normalizedQuery),
    );
  }, [conversationPubkeys, knownMembers, normalizedQuery]);

  const suggestedPeople = useMemo<KnownMember[]>(() => {
    if (normalizedQuery || knownMembers.length === 0) {
      return [];
    }
    return knownMembers.filter((member) => !conversationPubkeys.has(member.pubkey)).slice(0, 5);
  }, [conversationPubkeys, knownMembers, normalizedQuery]);

  const handleOpenConversation = (pubkey: string) => {
    openConversation(pubkey);
  };

  const renderConversationRow = (entry: (typeof conversationEntries)[number]) => {
    const lastMessageText = entry.lastMessage?.plaintext || "";
    const directionLabel =
      entry.lastMessage?.direction === "outgoing"
        ? "You"
        : entry.lastMessage?.direction === "incoming"
          ? entry.summary.displayName
          : "";

    return (
      <button
        key={entry.pubkey}
        type="button"
        onClick={() => handleOpenConversation(entry.pubkey)}
        className="flex w-full items-center gap-4 rounded-2xl border border-transparent px-4 py-3 text-left transition hover:border-brand/40 hover:bg-brand/5"
      >
        <img
          src={entry.summary.avatarUrl}
          alt={entry.summary.displayName}
          className="h-12 w-12 rounded-full border border-[var(--border-subtle)] object-cover"
        />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--fg-default)]">{entry.summary.displayName}</p>
            {entry.username && (
              <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                {entry.username}
              </span>
            )}
            <span className="text-[0.65rem] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
              {shortenPubkey(entry.pubkey)}
            </span>
          </div>
          <p className="text-xs text-[var(--fg-muted)]">
            {entry.lastMessage ? (
              <>
                <span className="font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                  {directionLabel}
                </span>{" "}
                {formatPreview(lastMessageText)}
              </>
            ) : (
              "No messages yet"
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-[0.65rem] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
            {formatTimestamp(entry.lastMessage?.createdAt ?? null)}
          </span>
          {entry.unreadCount > 0 && (
            <span className="min-w-[1.5rem] rounded-full bg-brand px-2 py-0.5 text-center text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-white">
              {entry.unreadCount}
            </span>
          )}
          {entry.error && (
            <span className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-[0.24em] text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              {entry.error}
            </span>
          )}
        </div>
      </button>
    );
  };

  const renderPersonRow = (member: (typeof knownMembers)[number]) => (
    <button
      key={member.pubkey}
      type="button"
      onClick={() => handleOpenConversation(member.pubkey)}
      className="flex w-full items-center gap-4 rounded-2xl border border-transparent px-4 py-3 text-left transition hover:border-brand/40 hover:bg-brand/5"
    >
      <img
        src={member.avatarUrl}
        alt={member.displayName}
        className="h-12 w-12 rounded-full border border-[var(--border-subtle)] object-cover"
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-[var(--fg-default)]">{member.displayName}</p>
        <div className="flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
          {member.username && <span>@{member.username}</span>}
          <span>{shortenPubkey(member.pubkey)}</span>
        </div>
      </div>
      <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
        <MessageCircle className="h-3.5 w-3.5" />
        Open chat
      </span>
    </button>
  );

  const showEmptyState = conversationEntries.length === 0;

  return (
    <div className="min-h-screen bg-[var(--bg-app)] px-4 py-10 text-[var(--fg-default)] sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Messages</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Browse every private conversation you&apos;ve started on Bitcoin Square. Select a thread to
            jump back into the encrypted chat overlay.
          </p>
        </header>

        <section className="space-y-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations by name or username"
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 py-3 pl-11 pr-4 text-sm text-[var(--fg-default)] outline-none transition focus:border-brand"
            />
          </div>

          {!ready && (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
              We&apos;re still preparing your keys. Messages will appear once your Nostr account is ready.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}

          {normalizedQuery ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">Conversations</h2>
                {filteredConversations.length === 0 ? (
                  <p className="mt-3 rounded-2xl bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
                    No conversations match “{query.trim()}”.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {filteredConversations.map((entry) => renderConversationRow(entry))}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">People</h2>
                {filteredPeople.length === 0 ? (
                  <p className="mt-3 rounded-2xl bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
                    No members found. Try another name or username.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {filteredPeople.map((member) => renderPersonRow(member))}
                  </div>
                )}
              </div>
            </div>
          ) : showEmptyState ? (
            <div className="rounded-2xl bg-[var(--bg-surface)]/60 p-6 text-sm text-[var(--fg-muted)]">
              <p>You haven&apos;t started any private conversations yet.</p>
              {suggestedPeople.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">
                    Suggested members
                  </h2>
                  {suggestedPeople.map((member) => renderPersonRow(member))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {conversationEntries.map((entry) => renderConversationRow(entry))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const MessagesRoute: React.FC = () => {
  const { user } = useAuth();
  const { openConversation, ready, error: dmError } = useDirectMessages();
  const { requestProfile, resolveProfileSummary, shortenPubkey } = useProfileIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ pubkey?: string }>();
  const [mode, setMode] = useState<"loading" | "list" | "start">("loading");
  const [targetPubkey, setTargetPubkey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true, state: { from: location } });
      return;
    }

    const viewerPubkey = user.nostrPublicKey?.trim() ?? null;
    const normalizedTarget = params.pubkey?.trim() ?? null;

    if (!normalizedTarget || (viewerPubkey && normalizedTarget === viewerPubkey)) {
      setMode("list");
      setTargetPubkey(null);
      return;
    }

    setMode("start");
    setTargetPubkey(normalizedTarget);
  }, [location, navigate, params.pubkey, user]);

  useEffect(() => {
    if (mode !== "start" || !targetPubkey) {
      return;
    }
    requestProfile(targetPubkey).catch(() => undefined);
  }, [mode, requestProfile, targetPubkey]);

  useEffect(() => {
    if (mode !== "start" || !targetPubkey) {
      return;
    }
    openConversation(targetPubkey);
  }, [mode, openConversation, targetPubkey]);

  if (!user) {
    return null;
  }

  if (mode === "list") {
    return <MessagesPage />;
  }

  if (mode === "loading") {
    return null;
  }

  if (!targetPubkey) {
    return <MessagesPage />;
  }

  const summary = resolveProfileSummary(targetPubkey);
  const friendlyName = summary.displayName || shortenPubkey(targetPubkey);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] px-4 py-10 text-[var(--fg-default)] sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Start a conversation</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            We&apos;re opening a private chat with {friendlyName}. {ready
              ? "The encrypted composer should appear in the corner."
              : "We need a moment to prepare your Nostr keys before you can send a message."}
          </p>
        </header>
        <section className="space-y-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
          {dmError ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
              {dmError}
            </div>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">
              The direct message overlay should appear automatically. If nothing opens, try the button below.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openConversation(targetPubkey)}
              className="inline-flex items-center gap-2 rounded-full border border-brand/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand transition hover:border-brand"
            >
              Retry opening chat
            </button>
            <Link
              to={`/profile/${targetPubkey}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
            >
              Back to profile
            </Link>
          </div>
          {!ready && (
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--fg-muted)]">
              Waiting for encrypted messaging keys…
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default MessagesRoute;
