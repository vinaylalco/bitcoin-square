import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, MessageCircle, Search } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  useDirectMessages,
  type DirectMessageEntry,
} from "../context/DirectMessageContext";
import {
  useProfileIdentity,
  type ProfileSummary,
} from "../context/ProfileIdentityContext";
import { useAuth } from "../context/AuthContext";
import type { MentionCandidate } from "../utils/mentions";
import useMentionAutocomplete from "../hooks/useMentionAutocomplete";

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
  const {
    conversations,
    openConversation,
    activeConversation,
    closeConversation,
    sendMessage,
    ready,
    error,
    getDraft,
    setDraft,
  } = useDirectMessages();
  const { profiles, resolveProfileSummary, requestProfile, shortenPubkey } = useProfileIdentity();
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  const viewerPubkey = user?.nostrPublicKey?.trim() ?? "";

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

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const map = new Map<string, MentionCandidate>();
    const addCandidate = (pubkeyValue: string | null | undefined) => {
      const trimmed = typeof pubkeyValue === "string" ? pubkeyValue.trim() : "";
      if (!trimmed || map.has(trimmed)) {
        return;
      }
      const summary = resolveProfileSummary(trimmed);
      const profile = profiles[trimmed]?.data ?? null;
      map.set(trimmed, {
        pubkey: trimmed,
        displayName: summary.displayName,
        screenName: profile?.screenName?.trim() ?? "",
        avatarUrl: summary.avatarUrl,
        shortPubkey: shortenPubkey(trimmed),
      });
    };

    Object.keys(conversations).forEach(addCandidate);
    knownMembers.forEach((member) => addCandidate(member.pubkey));
    Object.keys(profiles).forEach(addCandidate);
    if (viewerPubkey) {
      addCandidate(viewerPubkey);
    }

    return Array.from(map.values()).sort((a, b) => {
      const aKey = (a.screenName || a.displayName || a.shortPubkey).toLowerCase();
      const bKey = (b.screenName || b.displayName || b.shortPubkey).toLowerCase();
      if (aKey === bKey) {
        return a.displayName.localeCompare(b.displayName);
      }
      return aKey.localeCompare(bKey);
    });
  }, [conversations, knownMembers, profiles, resolveProfileSummary, shortenPubkey, viewerPubkey]);

  const applyMentionChange = useCallback(
    (nextValue: string) => {
      if (activeConversation) {
        setDraft(activeConversation, nextValue);
      }
    },
    [activeConversation, setDraft],
  );

  const {
    mentionActive,
    mentionResults,
    mentionHighlightIndex,
    setMentionHighlightIndex,
    listId: mentionListId,
    activeOptionId: activeMentionOptionId,
    handleKeyDown: handleMentionKeyDown,
    handleMentionSelection,
    updateMentionState,
    closeMention,
  } = useMentionAutocomplete({
    value: draft,
    onChange: applyMentionChange,
    textareaRef,
    candidates: mentionCandidates,
    limit: 5,
    listIdPrefix: "messages-composer-mentions",
  });

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

  const conversation = activeConversation ? conversations[activeConversation] : null;
  const draft = activeConversation ? getDraft(activeConversation) : "";
  const summary = activeConversation ? resolveProfileSummary(activeConversation) : null;
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!activeConversation) {
      closeMention();
      return;
    }
    const node = textareaRef.current;
    const caret =
      node && typeof node.selectionStart === "number"
        ? node.selectionStart
        : draft.length;
    updateMentionState(draft, caret);
  }, [activeConversation, draft, closeMention, updateMentionState]);

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleMentionKeyDown(event)) {
      return;
    }
  };

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    if (activeConversation) {
      setDraft(activeConversation, nextValue);
    }
    updateMentionState(nextValue, event.target.selectionStart ?? nextValue.length);
  };

  const handleTextareaSelect = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    updateMentionState(node.value, node.selectionStart ?? node.value.length);
  };

  const handleTextareaFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  };

  const handleTextareaBlur = () => {
    closeMention();
  };

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [conversation?.messages.length, activeConversation]);

  useEffect(() => {
    if (!activeConversation) {
      setComposerError(null);
      setSending(false);
    }
  }, [activeConversation]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeConversation || !draft.trim()) {
      return;
    }
    setComposerError(null);
    setSending(true);
    try {
      await sendMessage(activeConversation, draft);
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
      setComposerError(message);
    } finally {
      setSending(false);
      closeMention();
    }
  };

  const formatMessageTimestamp = (seconds: number) => {
    if (!Number.isFinite(seconds)) {
      return "";
    }
    const date = new Date(seconds * 1000);
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Messages</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Browse every private conversation you&apos;ve started on Bitcoin Square. Select a thread to
            jump back into the encrypted chat overlay.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section
            className={`space-y-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm ${
              activeConversation ? "hidden lg:block" : "block"
            }`}
          >
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

          <section
            className={`flex min-h-[32rem] flex-col rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm ${
              activeConversation ? "block" : "hidden lg:flex"
            }`}
          >
            {!activeConversation || !conversation || !summary ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--fg-muted)]">
                <Search className="h-10 w-10 text-[var(--fg-muted)]" />
                <div>
                  <p className="font-semibold text-[var(--fg-default)]">Select a conversation</p>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    Pick a thread from the list to start sending encrypted messages.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand lg:hidden"
                      onClick={closeConversation}
                    >
                      Back
                    </button>
                    <img
                      src={summary.avatarUrl}
                      alt={summary.displayName}
                      className="h-10 w-10 rounded-full border border-[var(--border-subtle)] object-cover"
                    />
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--fg-default)]">{summary.displayName}</h2>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                        {shortenPubkey(activeConversation)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeConversation}
                    className="hidden rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand lg:inline-flex"
                  >
                    Close
                  </button>
                </header>

                <div className="flex h-full flex-1 flex-col bg-[var(--bg-surface)]/60">
                  <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                    {conversation.messages.length === 0 ? (
                      <p className="mt-8 text-center text-xs uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                        No messages yet. Say hello!
                      </p>
                    ) : (
                      conversation.messages.map((message) => (
                        <div
                          key={message.id || message.clientId}
                          className={`flex ${message.direction === "outgoing" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-md ${
                              message.direction === "outgoing"
                                ? "bg-brand/90 text-white"
                                : "border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--fg-default)]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words leading-relaxed">{message.plaintext}</p>
                            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                              <span className="opacity-80">{formatMessageTimestamp(message.createdAt)}</span>
                              {message.direction === "outgoing" && (
                                <span className="opacity-80">
                                  {message.status === "pending"
                                    ? "Sending…"
                                    : message.status === "failed"
                                      ? "Failed"
                                      : "Sent"}
                                </span>
                              )}
                            </div>
                            {message.error && (
                              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-red-500">{message.error}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleSubmit} className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/80 px-5 py-4">
                    {!ready && (
                      <p className="mb-2 text-xs text-[var(--fg-muted)]">
                        {error ?? "Direct messages are initializing. Please wait."}
                      </p>
                    )}
                    {composerError && <p className="mb-2 text-xs text-red-500">{composerError}</p>}
                    <div className="flex items-end gap-3">
                      <div className="relative flex-1">
                        <textarea
                          ref={textareaRef}
                          value={draft}
                          onChange={handleTextareaChange}
                          onKeyDown={handleTextareaKeyDown}
                          onSelect={handleTextareaSelect}
                          onClick={handleTextareaSelect}
                          onFocus={handleTextareaFocus}
                          onBlur={handleTextareaBlur}
                          placeholder="Write a message…"
                          aria-autocomplete="list"
                          aria-haspopup="listbox"
                          aria-controls={mentionActive ? mentionListId : undefined}
                          aria-expanded={mentionActive}
                          aria-activedescendant={activeMentionOptionId}
                          className="h-24 w-full resize-none rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--fg-default)] outline-none transition focus:border-brand"
                        />
                        {mentionActive && (
                          <div
                            id={mentionListId}
                            role="listbox"
                            aria-label="Mention suggestions"
                            className="absolute left-0 right-0 top-full z-20 mt-2 max-h-60 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xl"
                          >
                            {mentionResults.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-[var(--fg-muted)]">No matches found.</p>
                            ) : (
                              <ul className="max-h-60 overflow-y-auto py-1">
                                {mentionResults.map((candidate, index) => {
                                  const optionId = `${mentionListId}-${candidate.pubkey}`;
                                  const isActive = index === mentionHighlightIndex;
                                  return (
                                    <li key={candidate.pubkey} role="presentation">
                                      <button
                                        id={optionId}
                                        role="option"
                                        aria-selected={isActive}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handleMentionSelection(candidate)}
                                        onMouseEnter={() => setMentionHighlightIndex(index)}
                                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
                                          isActive
                                            ? "bg-brand/10 text-brand"
                                            : "text-[var(--fg-default)] hover:bg-[var(--bg-surface)]/80"
                                        }`}
                                      >
                                        <img
                                          src={candidate.avatarUrl}
                                          alt={candidate.displayName}
                                          className="h-8 w-8 rounded-full border border-[var(--border-subtle)] object-cover"
                                        />
                                        <div className="flex min-w-0 flex-col">
                                          <span className="truncate text-sm font-semibold text-[var(--fg-default)]">
                                            {candidate.displayName}
                                          </span>
                                          <span className="truncate text-xs text-[var(--fg-muted)]">
                                            {candidate.screenName ? `@${candidate.screenName}` : candidate.shortPubkey}
                                          </span>
                                        </div>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={!draft.trim() || sending}
                        className="rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white transition disabled:cursor-not-allowed disabled:bg-brand/40"
                      >
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

const MessagesRoute: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ pubkey?: string }>();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    setAuthorized(false);

    if (!user) {
      navigate("/login", { replace: true, state: { from: location } });
      return;
    }

    const viewerPubkey = user.nostrPublicKey?.trim();
    const targetPubkey = params.pubkey?.trim();

    if (!viewerPubkey) {
      navigate(`/profile/${targetPubkey ?? ""}`, { replace: true });
      return;
    }

    if (!targetPubkey) {
      navigate(`/profile/${viewerPubkey}`, { replace: true });
      return;
    }

    if (targetPubkey !== viewerPubkey) {
      navigate(`/profile/${viewerPubkey}`, { replace: true });
      return;
    }

    setAuthorized(true);
  }, [location, navigate, params.pubkey, user]);

  if (!authorized) {
    return null;
  }

  return <MessagesPage />;
};

export default MessagesRoute;
