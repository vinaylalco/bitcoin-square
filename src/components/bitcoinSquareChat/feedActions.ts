import type React from "react";

import type { FeedPost } from "../../hooks/useBitcoinSquareFeed";

type ComposerMode = "new" | "reply" | "quote";

export type PendingMap = Set<string>;

export interface ComposerDialogDependencies {
  setComposerMode: (mode: ComposerMode) => void;
  setComposerTarget: (post: FeedPost | null) => void;
  setContent: (value: string) => void;
  setComposerError: (value: string | null) => void;
  setComposerOpen: (value: boolean) => void;
}

export const createOpenComposerDialog = ({
  setComposerMode,
  setComposerTarget,
  setContent,
  setComposerError,
  setComposerOpen,
}: ComposerDialogDependencies) =>
  (mode: ComposerMode, post?: FeedPost | null) => {
    setComposerMode(mode);
    const target = post ?? null;
    setComposerTarget(target);
    setContent("");
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
