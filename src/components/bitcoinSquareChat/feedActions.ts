import type React from "react";

import type { FeedPost } from "../../hooks/useBitcoinSquareFeed";

type ComposerMode = "new" | "reply" | "quote" | "edit";

export type PendingMap = Set<string>;

interface ComposerStateSnapshot {
  mode: ComposerMode;
  targetId: string | null;
  content: string;
  attachmentCount?: number;
}

export interface ComposerDialogDependencies {
  setComposerMode: (mode: ComposerMode) => void;
  setComposerTarget: (post: FeedPost | null) => void;
  setContent: (value: string) => void;
  setComposerError: (value: string | null) => void;
  setComposerOpen: (value: boolean) => void;
  getCurrentState?: () => ComposerStateSnapshot;
  shortenPubkey?: (value: string) => string;
  onOpenMode?: (mode: ComposerMode, target: FeedPost | null, context: { hasExistingDraft: boolean }) => void;
}

export const createOpenComposerDialog = ({
  setComposerMode,
  setComposerTarget,
  setContent,
  setComposerError,
  setComposerOpen,
  getCurrentState,
  shortenPubkey,
  onOpenMode,
}: ComposerDialogDependencies) =>
  (mode: ComposerMode, post?: FeedPost | null) => {
    setComposerMode(mode);
    const target = post ?? null;
    setComposerTarget(target);
    const snapshot = getCurrentState?.();
    const currentMode = snapshot?.mode;
    const currentTargetId = snapshot?.targetId ?? null;
    const currentContent = snapshot?.content ?? "";
    const currentAttachments = snapshot?.attachmentCount ?? 0;
    const sameMode = currentMode === mode;
    const sameTarget =
      mode === "new"
        ? !target && !currentTargetId
        : target?.id && currentTargetId
          ? target.id === currentTargetId
          : false;
    const hasExistingDraft = sameMode && sameTarget && (currentContent.trim().length > 0 || currentAttachments > 0);

    if (mode === "reply" && target) {
      if (!hasExistingDraft) {
        const mention = shortenPubkey ? shortenPubkey(target.pubkey) : `${target.pubkey.slice(0, 8)}…`;
        const normalizedMention = mention.startsWith("@") ? mention : `@${mention}`;
        setContent(`${normalizedMention} `);
      }
    } else if (mode === "quote" && target) {
      if (!hasExistingDraft) {
        const lines = target.content.split("\n");
        const quoted = lines.map((line) => `> ${line}`.trimEnd()).join("\n");
        setContent(`${quoted}\n\n`);
      }
    } else if (mode === "edit" && target) {
      if (!hasExistingDraft) {
        setContent(target.content ?? "");
      }
    } else if (mode === "new") {
      if (!hasExistingDraft) {
        setContent("");
      }
    }

    onOpenMode?.(mode, target, { hasExistingDraft });
    setComposerError(null);
    setComposerOpen(true);
  };

export interface FeedActionDependencies {
  openComposerDialog: (mode: ComposerMode, post?: FeedPost | null) => void;
  likePost: (post: FeedPost) => Promise<void>;
  updatePending: (
    setter: React.Dispatch<React.SetStateAction<PendingMap>>,
    id: string,
    add: boolean,
  ) => void;
  setPendingLikes: React.Dispatch<React.SetStateAction<PendingMap>>;
  logger?: Pick<Console, "warn">;
}

export const createFeedActionHandlers = ({
  openComposerDialog,
  likePost,
  updatePending,
  setPendingLikes,
  logger,
}: FeedActionDependencies) => {
  const log = logger ?? console;
  return {
    handlePost: () => {
      openComposerDialog("new");
    },
    handleReply: (post: FeedPost) => {
      openComposerDialog("reply", post);
    },
    handleQuote: (post: FeedPost) => {
      openComposerDialog("quote", post);
    },
    handleEdit: (post: FeedPost) => {
      openComposerDialog("edit", post);
    },
    handleLike: async (post: FeedPost) => {
      updatePending(setPendingLikes, post.id, true);
      try {
        await likePost(post);
      } catch (reactionError) {
        log.warn("Unable to react to post", reactionError);
      } finally {
        updatePending(setPendingLikes, post.id, false);
      }
    },
  } as const;
};

export type { ComposerMode };
