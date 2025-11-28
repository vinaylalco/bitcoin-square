import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, MessageCircle, Search, X } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  useDirectMessages,
  type DirectMessageEntry,
} from "../context/DirectMessageContext";
import {
  fallbackProfileAvatar,
  useProfileIdentity,
  type ProfileSummary,
} from "../context/ProfileIdentityContext";
import { useAuth } from "../context/AuthContext";
import { useNostrAccount } from "../hooks/useNostrAccount";
import { searchUsersByScreenName, type ScreenNameUser } from "../api/users";
import type { MentionCandidate } from "../utils/mentions";
import useMentionAutocomplete from "../hooks/useMentionAutocomplete";
import { normalizeToHexPubkey } from "../utils/nostr";
import {
  CommunityTranslationProvider,
  useCommunityTranslation,
} from "../context/CommunityTranslationContext";
import useOnScreen from "../hooks/useOnScreen";
import { extractLanguageTag, shouldTranslateForTargetLanguage } from "../utils/nostrLanguage";

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const createMessageTranslationKey = (
  message: DirectMessageEntry,
  index: number,
): string => {
  if (message.id && message.id.trim().length > 0) {
    return `dm:${message.id}`;
  }
  if (message.clientId && message.clientId.trim().length > 0) {
    return `dm:client:${message.clientId}`;
  }
  return `dm:fallback:${message.createdAt}:${index}`;
};

interface DirectMessageRowProps {
  message: DirectMessageEntry;
  index: number;
  latestMessageIndex: number;
  summary: ProfileSummary | null;
  messageLookup: Map<string, DirectMessageEntry>;
  onSelectReply: (key: string) => void;
  formatMessageTimestamp: (seconds: number) => string;
}

const DirectMessageRow: React.FC<DirectMessageRowProps> = ({
  message,
  index,
  latestMessageIndex,
  summary,
  messageLookup,
  onSelectReply,
  formatMessageTimestamp,
}) => {
  const {
    isSupported: translationSupported,
    autoTranslateEnabled,
    ensureTranslation,
    getTranslation,
    isOriginalVisible,
    toggleOriginal,
    formatLanguageName,
    targetLanguage,
    targetLanguageLabel,
  } = useCommunityTranslation();
  const translationsTemporarilyDisabled = true;
  const translationContextAvailable = !translationsTemporarilyDisabled && Boolean(translationSupported);
  const [ref, visible] = useOnScreen<HTMLDivElement>();

  const messageTranslationKey = createMessageTranslationKey(message, index);
  const translationEntry = translationContextAvailable
    ? getTranslation(messageTranslationKey)
    : undefined;
  const translationStatus = translationEntry?.status ?? "idle";
  const rawTranslatedText =
    translationEntry?.translatedText && translationEntry.translatedText.trim().length > 0
      ? translationEntry.translatedText
      : undefined;
  const translationReady =
    (translationStatus === "ready" || translationStatus === "success") && !!rawTranslatedText;
  const showOriginal = !translationReady || isOriginalVisible(messageTranslationKey);
  const detectedLanguageLabel =
    translationEntry?.detectedLanguage && translationEntry.detectedLanguage.trim().length > 0
      ? formatLanguageName(translationEntry.detectedLanguage)
      : null;
  const isLatestMessage = index === latestMessageIndex;
  const allowManualTranslation =
    translationContextAvailable && !isLatestMessage && translationStatus === "idle";
  const showTranslationControls =
    translationContextAvailable &&
    (translationStatus === "loading" || translationStatus === "error" || translationReady || allowManualTranslation);
  const isOutgoing = message.direction === "outgoing";
  const translationMetaColor = isOutgoing
    ? "text-[color:var(--chat-bubble-self-muted)]"
    : "text-[var(--fg-muted)]";
  const displayedText = showOriginal || !rawTranslatedText ? message.plaintext : rawTranslatedText;

  const replySource =
    message.replyToId && messageLookup.has(message.replyToId)
      ? messageLookup.get(message.replyToId) ?? null
      : null;
  const replyLabel = replySource?.direction === "outgoing" ? "You" : summary?.displayName || "Community member";
  const replyPreviewClass = isOutgoing
    ? "border-[color:var(--chat-bubble-self-border)] bg-[color:var(--chat-bubble-self-bg)]/90 text-[color:var(--chat-bubble-self-muted)]"
    : "border-[color:var(--chat-bubble-peer-border)] bg-[var(--chat-bubble-peer-bg)] text-[var(--fg-muted)]";
  const replyUnavailableClass = isOutgoing
    ? "border-dashed border-[color:var(--chat-bubble-self-border)] bg-[color:var(--chat-bubble-self-bg)]/70 text-[color:var(--chat-bubble-self-muted)]"
    : "border-dashed border-[color:var(--chat-bubble-peer-border)] bg-[var(--chat-bubble-peer-bg)] text-[var(--fg-muted)]";
  const replyButtonTint = isOutgoing
    ? "border-[color:var(--chat-bubble-self-border)] bg-[color:var(--chat-bubble-self-bg)] text-[color:var(--chat-bubble-self-muted)] hover:bg-[color:var(--chat-bubble-self-bg)]/90 focus-visible:ring-brand/50"
    : "border-[color:var(--chat-bubble-peer-border)] bg-[var(--chat-bubble-peer-bg)] text-[var(--fg-muted)] hover:border-brand hover:text-brand focus-visible:ring-brand/40";
  const messageKeyForReply = !message.id.startsWith("pending-") ? message.id : message.clientId ?? message.id;

  useEffect(() => {
    if (!translationContextAvailable || !autoTranslateEnabled || !visible) {
      return;
    }
    if (!shouldTranslateForTargetLanguage(message.language ?? null, targetLanguage)) {
      return;
    }
    const entry = getTranslation(messageTranslationKey);
    if (!entry || entry.status === "idle" || entry.status === "error") {
      ensureTranslation(messageTranslationKey, message.plaintext, { roomId: accountPubkey });
    }
  }, [
    autoTranslateEnabled,
    accountPubkey,
    ensureTranslation,
    getTranslation,
    message.plaintext,
    message.language,
    messageTranslationKey,
    targetLanguage,
    translationContextAvailable,
    visible,
  ]);

  return (
    <div
      ref={ref}
      className={`group relative flex ${isOutgoing ? "justify-end" : "justify-start"} ${
        isLatestMessage ? "pb-[calc(7rem+env(safe-area-inset-bottom,0px)+6.5rem)]" : ""
      }`}
      style={
        isLatestMessage
          ? {
              paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px) + 6.5rem)",
            }
          : undefined
      }
    >
      <div
        className={`relative max-w-[85%] rounded-2xl border px-4 py-3 text-sm lg:max-w-[50%] ${
          isOutgoing
            ? "bg-[color:var(--chat-bubble-self-bg)] text-[color:var(--chat-bubble-self-fg)] shadow-xl border-[color:var(--chat-bubble-self-border)]"
            : "bg-[var(--chat-bubble-peer-bg)] text-[var(--fg-default)] shadow-sm border-[color:var(--chat-bubble-peer-border)]"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectReply(messageKeyForReply)}
          className={`absolute -top-3 ${isOutgoing ? "right-3" : "left-3"} flex h-8 w-8 items-center justify-center rounded-full border p-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${replyButtonTint}`}
          aria-label="Reply to message"
        >
          <MessageCircle className="h-4 w-4" />
        </button>
        {replySource ? (
          <div className={`mb-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${replyPreviewClass}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em]">Replying to {replyLabel}</p>
            <p className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap break-words text-[0.75rem] leading-relaxed">
              {replySource.plaintext}
            </p>
          </div>
        ) : message.replyToId ? (
          <div className={`mb-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${replyUnavailableClass}`}>
            Original message unavailable.
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words leading-relaxed">{displayedText}</p>
        {showTranslationControls && (
          <div className="mt-2 space-y-1">
            {translationStatus === "loading" ? (
              <p className={`text-[10px] uppercase tracking-[0.2em] ${translationMetaColor}`}>
                Translating to {targetLanguageLabel}…
              </p>
            ) : translationStatus === "error" ? (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] ${translationMetaColor}`}
              >
                <span>Translation failed.</span>
                <button
                  type="button"
                  onClick={() =>
                    ensureTranslation(messageTranslationKey, message.plaintext, {
                      roomId: accountPubkey,
                      force: true,
                    })
                  }
                  className="font-semibold uppercase tracking-[0.2em] transition hover:opacity-80"
                >
                  Retry
                </button>
              </div>
            ) : translationReady ? (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] ${translationMetaColor}`}
              >
                <span className="flex-1">
                  {detectedLanguageLabel ? `Translated from ${detectedLanguageLabel}` : "Translated"}
                  {translationEntry?.provider ? ` · ${translationEntry.provider}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => toggleOriginal(messageTranslationKey)}
                  className="font-semibold uppercase tracking-[0.2em] transition hover:opacity-80"
                >
                  {showOriginal ? "View translation" : "View original"}
                </button>
              </div>
            ) : null}
            {allowManualTranslation && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    ensureTranslation(messageTranslationKey, message.plaintext, {
                      roomId: accountPubkey,
                      force: true,
                    })
                  }
                  className={`text-[10px] font-semibold uppercase tracking-[0.2em] transition hover:opacity-80 ${
                    message.direction === "outgoing"
                      ? "text-[color:var(--chat-bubble-self-fg)]"
                      : "text-[var(--fg-default)]"
                  }`}
                >
                  Translate
                </button>
              </div>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-muted)]">
          <span className="opacity-80">{formatMessageTimestamp(message.createdAt)}</span>
          {message.direction === "outgoing" && (
            <span className="opacity-80">
              {message.status === "pending" ? "Sending…" : message.status === "failed" ? "Failed" : "Sent"}
            </span>
          )}
        </div>
        {message.error && (
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-red-500">{message.error}</p>
        )}
      </div>
    </div>
  );
};

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
  screenName: string;
  screenNameLower: string;
  avatarUrl: string;
}

interface MessagesPageProps {
  variant?: "standalone" | "embedded";
}

const MessagesPage: React.FC<MessagesPageProps> = ({ variant = "standalone" }) => {
  const isEmbedded = variant === "embedded";
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
    markInboxAsViewed,
    hasUnreadMessages,
  } = useDirectMessages();
  const {
    profiles,
    resolveProfileSummary,
    requestProfile,
    followersFor,
    following,
    shortenPubkey,
  } = useProfileIdentity();
  const { user } = useAuth();
  const { pubkey: accountPubkey } = useNostrAccount();
  const [query, setQuery] = useState("");
  const [relationshipPubkeys, setRelationshipPubkeys] = useState<string[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);

  const viewerPubkey = user?.nostrPublicKey?.trim() ?? "";
  const viewerProfile = viewerPubkey ? profiles[viewerPubkey]?.data ?? null : null;

  const normalizedQuery = normalizeSearch(query);

  const conversation = activeConversation ? conversations[activeConversation] : null;
  const draft = activeConversation ? getDraft(activeConversation) : "";
  const summary = activeConversation ? resolveProfileSummary(activeConversation) : null;

  useEffect(() => {
    markInboxAsViewed();
  }, [hasUnreadMessages, markInboxAsViewed]);

  useEffect(() => {
    const keys = Object.keys(conversations);
    keys.forEach((pubkey) => {
      requestProfile(pubkey).catch(() => undefined);
    });
  }, [conversations, requestProfile]);

  useEffect(() => {
    if (!viewerPubkey) {
      setRelationshipPubkeys([]);
      setRelationshipsLoading(false);
      setRelationshipsError(null);
      return;
    }

    let cancelled = false;

    const loadRelationships = async () => {
      setRelationshipsLoading(true);
      setRelationshipsError(null);
      let loadError: string | null = null;

      const rawCandidates = new Set<string>();
      const addCandidate = (value: string | null | undefined) => {
        if (!value || typeof value !== "string") {
          return;
        }
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return;
        }
        rawCandidates.add(trimmed);
      };

      Array.from(following).forEach((value) => addCandidate(value));
      followersFor(viewerPubkey).forEach((value) => addCandidate(value));

      try {
        const profile = await requestProfile(viewerPubkey);
        profile?.following?.forEach((value) => addCandidate(value));
        profile?.followers?.forEach((value) => addCandidate(value));
      } catch (profileError) {
        loadError =
          profileError instanceof Error && profileError.message
            ? profileError.message
            : "Unable to load social connections right now.";
      }

      const normalized = await Promise.all(
        Array.from(rawCandidates).map(async (candidate) => normalizeToHexPubkey(candidate)),
      );

      const next = new Set<string>();
      normalized.forEach((pubkey) => {
        if (!pubkey || pubkey === viewerPubkey) {
          return;
        }
        next.add(pubkey);
      });

      if (!cancelled) {
        setRelationshipPubkeys(Array.from(next));
        setRelationshipsError(loadError && next.size === 0 ? loadError : null);
      }

      await Promise.all(
        Array.from(next).map((pubkey) => requestProfile(pubkey).catch(() => undefined)),
      );
    };

    loadRelationships()
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Unable to load social connections right now.";
        setRelationshipsError(message);
        setRelationshipPubkeys([]);
      })
      .finally(() => {
        if (!cancelled) {
          setRelationshipsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    followersFor,
    following,
    requestProfile,
    viewerPubkey,
    viewerProfile?.followers,
    viewerProfile?.following,
  ]);

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

  const relationshipMembers = useMemo<KnownMember[]>(() => {
    if (relationshipPubkeys.length === 0) {
      return [];
    }

    const members = relationshipPubkeys.map((pubkey) => {
      const summary = resolveProfileSummary(pubkey);
      const profile = profiles[pubkey]?.data ?? null;
      const screenName = profile?.screenName?.trim() ?? "";
      return {
        pubkey,
        displayName: summary.displayName,
        screenName,
        screenNameLower: screenName.toLowerCase(),
        avatarUrl: summary.avatarUrl,
      };
    });

    members.sort((a, b) => {
      const aKey = a.screenNameLower || a.displayName.toLowerCase();
      const bKey = b.screenNameLower || b.displayName.toLowerCase();
      if (aKey === bKey) {
        return a.displayName.localeCompare(b.displayName);
      }
      return aKey.localeCompare(bKey);
    });

    return members;
  }, [relationshipPubkeys, resolveProfileSummary, profiles]);

  const mapUserToMentionCandidate = useCallback(
    (user: ScreenNameUser): MentionCandidate | null => {
      const screenName = user.screenName.trim();
      const pubkeyValue = user.nostrPubkey?.trim();
      if (!screenName || !pubkeyValue) {
        return null;
      }
      const summary = resolveProfileSummary(pubkeyValue);
      const displayName = summary.displayName?.trim() || `@${screenName}`;
      const avatarUrl =
        summary.avatarUrl ||
        user.avatarUrl ||
        fallbackProfileAvatar(pubkeyValue);
      return {
        pubkey: pubkeyValue,
        displayName,
        screenName,
        avatarUrl,
        shortPubkey: shortenPubkey(pubkeyValue),
      };
    },
    [fallbackProfileAvatar, resolveProfileSummary, shortenPubkey],
  );

  const localMentionCandidates = useMemo(() => {
    const list: MentionCandidate[] = [];
    const seen = new Set<string>();
    Object.entries(profiles).forEach(([pubkey, entry]) => {
      const screenName = entry.data?.screenName?.trim();
      if (!screenName) {
        return;
      }
      const normalized = screenName.toLowerCase();
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      const summary = resolveProfileSummary(pubkey);
      const displayName = summary.displayName?.trim() || `@${screenName}`;
      list.push({
        pubkey,
        displayName,
        screenName,
        avatarUrl: summary.avatarUrl || fallbackProfileAvatar(pubkey),
        shortPubkey: shortenPubkey(pubkey),
      });
    });
    list.sort((a, b) => a.screenName.toLowerCase().localeCompare(b.screenName.toLowerCase()));
    return list;
  }, [fallbackProfileAvatar, profiles, resolveProfileSummary, shortenPubkey]);

  const fetchMentionCandidates = useCallback(
    async (query: string, limit: number) => {
      const users = await searchUsersByScreenName(query, limit);
      users.forEach((user) => {
        if (user.nostrPubkey) {
          requestProfile(user.nostrPubkey).catch(() => undefined);
        }
      });
      const mapped = users
        .map((user) => mapUserToMentionCandidate(user))
        .filter((candidate): candidate is MentionCandidate => Boolean(candidate));
      return mapped.slice(0, limit);
    },
    [mapUserToMentionCandidate, requestProfile],
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
    fetchCandidates: fetchMentionCandidates,
    candidates: localMentionCandidates,
    limit: 5,
    listIdPrefix: "messages-composer-mentions",
  });

  const filteredPeople = useMemo<KnownMember[]>(() => {
    if (!normalizedQuery) {
      return [];
    }
    return relationshipMembers.filter(
      (member) => member.screenNameLower && member.screenNameLower.includes(normalizedQuery),
    );
  }, [relationshipMembers, normalizedQuery]);

  const suggestedPeople = useMemo<KnownMember[]>(() => {
    if (normalizedQuery || relationshipMembers.length === 0) {
      return [];
    }
    return relationshipMembers.slice(0, 8);
  }, [relationshipMembers, normalizedQuery]);

  const handleOpenConversation = (pubkey: string) => {
    openConversation(pubkey);
  };

  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollStickToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [replyTargetKey, setReplyTargetKey] = useState<string | null>(null);
  const composerContainerRef = useRef<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const chatSpacing = useMemo(() => {
    const safeInset = "env(safe-area-inset-bottom, 0px)";
    const measuredHeight = composerHeight > 0 ? `${composerHeight}px` : "7rem";
    return {
      padding: `calc(${measuredHeight} + ${safeInset} + 2.5rem)`,
      buttonOffset: `calc(${measuredHeight} + ${safeInset} + 1.5rem)`,
    };
  }, [composerHeight]);
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

  const messageCount = conversation?.messages.length ?? 0;
  const messageLookup = useMemo(() => {
    const map = new Map<string, DirectMessageEntry>();
    conversation?.messages.forEach((message) => {
      map.set(message.id, message);
      if (message.clientId) {
        map.set(message.clientId, message);
      }
    });
    return map;
  }, [conversation?.messages]);

  const replyTarget = useMemo(() => {
    if (!replyTargetKey) {
      return null;
    }
    return messageLookup.get(replyTargetKey) ?? null;
  }, [messageLookup, replyTargetKey]);

  const handleSelectReply = useCallback((key: string) => {
    setReplyTargetKey(key);
    scrollStickToBottomRef.current = true;
  }, []);

  const updateScrollState = useCallback(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 48;
    scrollStickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom && messageCount > 0);
  }, [messageCount]);

  const handleScrollToBottom = useCallback(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    scrollStickToBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    const node = composerContainerRef.current;
    if (!node) {
      setComposerHeight(0);
      return;
    }
    const updateHeight = () => {
      setComposerHeight(node.offsetHeight);
    };
    updateHeight();
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [mentionActive, replyTarget]);

  useEffect(() => {
    if (!listRef.current) return;
    if (scrollStickToBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messageCount, activeConversation]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => updateScrollState();
    container.addEventListener("scroll", handleScroll, { passive: true });
    updateScrollState();
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [activeConversation, updateScrollState]);

  useEffect(() => {
    updateScrollState();
  }, [messageCount, updateScrollState]);

  useEffect(() => {
    if (!activeConversation) {
      return;
    }

    scrollStickToBottomRef.current = true;
    requestAnimationFrame(() => handleScrollToBottom());
  }, [activeConversation, handleScrollToBottom]);

  const latestMessageIndex = conversation ? conversation.messages.length - 1 : -1;
  const latestMessage =
    latestMessageIndex >= 0 ? conversation?.messages[latestMessageIndex] ?? null : null;

  useEffect(() => {
    if (!activeConversation) {
      setComposerError(null);
      setSending(false);
    }
  }, [activeConversation]);

  useEffect(() => {
    scrollStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    setReplyTargetKey(null);
  }, [activeConversation]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeConversation || !draft.trim()) {
      return;
    }
    setComposerError(null);
    setSending(true);
    try {
      const replyEventId =
        replyTarget && replyTarget.id && !replyTarget.id.startsWith("pending-")
          ? replyTarget.id
          : null;
      await sendMessage(activeConversation, draft, { replyToId: replyEventId });
      setReplyTargetKey(null);
      scrollStickToBottomRef.current = true;
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
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
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

  const renderPersonRow = (member: (typeof relationshipMembers)[number]) => (
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
      </div>
    </button>
  );

  const showEmptyState = conversationEntries.length === 0;

  return (
    <div
      className={
        isEmbedded
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden text-[var(--fg-default)]"
          : "min-h-screen w-full overflow-x-hidden bg-[var(--bg-app)] px-4 py-10 text-[var(--fg-default)] sm:px-6"
      }
    >
      <div
        className={
          isEmbedded
            ? "flex flex-1 min-h-0 w-full flex-col gap-6 overflow-x-hidden"
            : "mx-auto flex w-full max-w-5xl flex-col gap-8 overflow-x-hidden"
        }
      >
        <div
          className={`grid min-h-0 w-full gap-6 overflow-x-hidden lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] ${
            isEmbedded ? "flex-1 overflow-y-auto" : ""
          }`}
        >
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
                placeholder="Search conversations or screen names"
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
                  <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">Connections</h2>
                  {relationshipsLoading ? (
                    <p className="mt-3 rounded-2xl bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
                      Loading connections…
                    </p>
                  ) : filteredPeople.length === 0 ? (
                    <p className="mt-3 rounded-2xl bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
                      {relationshipsError ?? "No members found. Try another screen name."}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {filteredPeople.map((member) => renderPersonRow(member))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {showEmptyState ? (
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
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">Connections</h2>
                  {relationshipsLoading ? (
                    <p className="mt-3 rounded-2xl bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
                      Loading connections…
                    </p>
                  ) : relationshipMembers.length === 0 ? (
                    <p className="mt-3 rounded-2xl bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
                      {relationshipsError ?? "You don&apos;t have any followers or following yet."}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {relationshipMembers.map((member) => renderPersonRow(member))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section
            className={`flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm ${
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

                <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-surface)]/60">
                  <div
                    ref={listRef}
                    className="flex-1 min-h-0 space-y-3 overflow-y-auto px-5 pt-4"
                    style={{ paddingBottom: chatSpacing.padding }}
                  >
                    {conversation.messages.length === 0 ? (
                      <p className="mt-8 text-center text-xs uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                        No messages yet. Say hello!
                      </p>
                    ) : (
                      conversation.messages.map((message, index) => (
                        <DirectMessageRow
                          key={message.id || message.clientId || createMessageTranslationKey(message, index)}
                          message={message}
                          index={index}
                          latestMessageIndex={latestMessageIndex}
                          summary={summary}
                          messageLookup={messageLookup}
                          onSelectReply={handleSelectReply}
                          formatMessageTimestamp={formatMessageTimestamp}
                        />
                      ))
                    )}
                  </div>

                  {showScrollToBottom && (
                    <button
                      type="button"
                      onClick={handleScrollToBottom}
                      className="absolute right-8 z-10 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white shadow-lg transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      style={{ bottom: chatSpacing.buttonOffset }}
                    >
                      <ArrowDown className="h-4 w-4" />
                      <span>Go to latest</span>
                    </button>
                  )}

                  {activeConversation && conversation && (
                    <div
                      ref={composerContainerRef}
                      className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-5 bottom-[calc(100%-1rem)] h-24 rounded-t-3xl bg-gradient-to-t from-[var(--bg-surface)]/95 via-[var(--bg-surface)]/70 to-transparent"
                      />
                      <div className="relative mx-auto flex w-full max-w-5xl justify-center sm:px-0 lg:justify-end">
                        <div className="pointer-events-auto w-full overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/95 shadow-xl backdrop-blur">
                          {replyTarget && (
                            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                                  Replying to {replyTarget.direction === "outgoing" ? "you" : summary.displayName || "a member"}
                                </p>
                                <p className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--fg-default)] opacity-90">
                                  {replyTarget.plaintext}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setReplyTargetKey(null)}
                                className="rounded-full border border-[var(--border-subtle)] p-1 text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                              >
                                <span className="sr-only">Cancel reply</span>
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                          <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-5 py-4">
                            {!ready && (
                              <p className="text-xs text-[var(--fg-muted)]">
                                {error ?? "Direct messages are initializing. Please wait."}
                              </p>
                            )}
                            {composerError && <p className="text-xs text-red-500">{composerError}</p>}
                            <div className="relative w-full">
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
                                              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition${
                                                isActive
                                                  ? " bg-brand/10 text-brand"
                                                  : " text-[var(--fg-default)] hover:bg-[var(--bg-surface)]/80"
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
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-xs text-[var(--fg-muted)]">
                                {ready
                                  ? "Messages are encrypted end-to-end via Nostr."
                                  : "Waiting for your encrypted keys to finish loading."}
                              </div>
                              <div className="flex justify-end">
                                <button
                                  type="submit"
                                  disabled={!draft.trim() || sending}
                                  className="rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white transition disabled:cursor-not-allowed disabled:bg-brand/40"
                                >
                                  {sending ? "Sending…" : "Send"}
                                </button>
                              </div>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>
                  )}

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
      navigate("/membership?view=login", { replace: true, state: { from: location } });
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

  return (
    <CommunityTranslationProvider>
      <MessagesPage />
    </CommunityTranslationProvider>
  );
};

export { MessagesPage };
export default MessagesRoute;
