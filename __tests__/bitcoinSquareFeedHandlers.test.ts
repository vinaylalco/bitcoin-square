/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";

import {
  createFeedActionHandlers,
  createOpenComposerDialog,
} from "../src/components/bitcoinSquareChat/feedActions";
import type { ComposerMode } from "../src/components/bitcoinSquareChat/feedActions";
import type { FeedPost } from "../src/hooks/useBitcoinSquareFeed";

describe("createOpenComposerDialog", () => {
  const basePost: FeedPost = {
    id: "event-id",
    pubkey: "abcdef1234567890",
    created_at: 1,
    content: "First line\nSecond line",
    tags: [],
    attachments: [],
    status: "ok",
    optimistic: false,
    event: {} as any,
  };

  const setup = () => {
    const setComposerMode = vi.fn();
    const setComposerTarget = vi.fn();
    const setContent = vi.fn();
    const setComposerError = vi.fn();
    const setComposerOpen = vi.fn();
    const shortenPubkey = vi.fn((value: string) => `${value.slice(0, 8)}…`);
    const state: { mode: ComposerMode; targetId: string | null; content: string; attachmentCount: number } = {
      mode: "new",
      targetId: null,
      content: "",
      attachmentCount: 0,
    };
    const getCurrentState = vi.fn(() => state);
    const onOpenMode = vi.fn();

    const openComposerDialog = createOpenComposerDialog({
      setComposerMode,
      setComposerTarget,
      setContent,
      setComposerError,
      setComposerOpen,
      shortenPubkey,
      getCurrentState,
      onOpenMode,
    });

    return {
      openComposerDialog,
      setComposerMode,
      setComposerTarget,
      setContent,
      setComposerError,
      setComposerOpen,
      shortenPubkey,
      getCurrentState,
      onOpenMode,
      state,
    };
  };

  it("prepares a blank composer for new posts", () => {
    const controls = setup();
    controls.openComposerDialog("new");

    expect(controls.setComposerMode).toHaveBeenCalledWith("new");
    expect(controls.setComposerTarget).toHaveBeenCalledWith(null);
    expect(controls.setContent).toHaveBeenCalledWith("");
    expect(controls.setComposerError).toHaveBeenCalledWith(null);
    expect(controls.setComposerOpen).toHaveBeenCalledWith(true);
    expect(controls.onOpenMode).toHaveBeenCalledWith("new", null, { hasExistingDraft: false });
  });

  it("prefills a reply with a shortened mention", () => {
    const controls = setup();
    controls.openComposerDialog("reply", basePost);

    expect(controls.setComposerMode).toHaveBeenCalledWith("reply");
    expect(controls.setComposerTarget).toHaveBeenCalledWith(basePost);
    expect(controls.shortenPubkey).toHaveBeenCalledWith(basePost.pubkey);
    expect(controls.setContent).toHaveBeenCalledWith(`@${basePost.pubkey.slice(0, 8)}… `);
    expect(controls.setComposerError).toHaveBeenCalledWith(null);
    expect(controls.setComposerOpen).toHaveBeenCalledWith(true);
    expect(controls.onOpenMode).toHaveBeenCalledWith("reply", basePost, { hasExistingDraft: false });
  });

  it("quotes each line when quoting a post", () => {
    const controls = setup();
    controls.openComposerDialog("quote", basePost);

    expect(controls.setComposerMode).toHaveBeenCalledWith("quote");
    expect(controls.setComposerTarget).toHaveBeenCalledWith(basePost);
    expect(controls.setContent).toHaveBeenCalledWith("> First line\n> Second line\n\n");
    expect(controls.onOpenMode).toHaveBeenCalledWith("quote", basePost, { hasExistingDraft: false });
  });

  it("preserves existing drafts for the same context", () => {
    const controls = setup();
    controls.state.mode = "new";
    controls.state.targetId = null;
    controls.state.content = "Existing draft";
    controls.state.attachmentCount = 0;
    controls.setContent.mockClear();

    controls.openComposerDialog("new");

    expect(controls.setContent).not.toHaveBeenCalled();
    expect(controls.onOpenMode).toHaveBeenCalledWith("new", null, { hasExistingDraft: true });
  });

  it("prefills edit mode when no draft exists", () => {
    const controls = setup();
    controls.openComposerDialog("edit", basePost);

    expect(controls.setComposerMode).toHaveBeenCalledWith("edit");
    expect(controls.setComposerTarget).toHaveBeenCalledWith(basePost);
    expect(controls.setContent).toHaveBeenCalledWith(basePost.content);
    expect(controls.onOpenMode).toHaveBeenCalledWith("edit", basePost, { hasExistingDraft: false });
  });

  it("retains edit drafts when reopening", () => {
    const controls = setup();
    controls.state.mode = "edit";
    controls.state.targetId = basePost.id;
    controls.state.content = "Updated content";
    controls.state.attachmentCount = 1;
    controls.setContent.mockClear();

    controls.openComposerDialog("edit", basePost);

    expect(controls.setContent).not.toHaveBeenCalled();
    expect(controls.onOpenMode).toHaveBeenCalledWith("edit", basePost, { hasExistingDraft: true });
  });
});

describe("createFeedActionHandlers", () => {
  const post: FeedPost = {
    id: "like-id",
    pubkey: "feed-pubkey",
    created_at: 1,
    content: "Hello",
    tags: [],
    attachments: [],
    status: "ok",
    optimistic: false,
    event: {} as any,
  };

  const setup = (likeImpl: (post: FeedPost) => Promise<void>) => {
    const openComposerDialog = vi.fn();
    const likePost = vi.fn(likeImpl);
    const updatePending = vi.fn();
    const setPendingLikes = vi.fn();
    const logger = { warn: vi.fn() };

    const handlers = createFeedActionHandlers({
      openComposerDialog,
      likePost,
      updatePending,
      setPendingLikes,
      logger,
    });

    return { handlers, openComposerDialog, likePost, updatePending, setPendingLikes, logger };
  };

  it("opens the composer for new, reply, quote, and edit actions", () => {
    const controls = setup(async () => {});

    controls.handlers.handlePost();
    expect(controls.openComposerDialog).toHaveBeenCalledWith("new");

    controls.handlers.handleReply(post);
    expect(controls.openComposerDialog).toHaveBeenCalledWith("reply", post);

    controls.handlers.handleQuote(post);
    expect(controls.openComposerDialog).toHaveBeenCalledWith("quote", post);

    controls.handlers.handleEdit(post);
    expect(controls.openComposerDialog).toHaveBeenCalledWith("edit", post);
  });

  it("optimistically tracks pending likes and clears on success", async () => {
    const controls = setup(async () => {});

    await controls.handlers.handleLike(post);

    expect(controls.updatePending).toHaveBeenNthCalledWith(1, controls.setPendingLikes, post.id, true);
    expect(controls.likePost).toHaveBeenCalledWith(post);
    expect(controls.updatePending).toHaveBeenNthCalledWith(2, controls.setPendingLikes, post.id, false);
    expect(controls.logger.warn).not.toHaveBeenCalled();
  });

  it("logs a warning when liking fails but still clears the pending state", async () => {
    const controls = setup(async () => {
      throw new Error("failed");
    });

    await controls.handlers.handleLike(post);

    expect(controls.updatePending).toHaveBeenNthCalledWith(1, controls.setPendingLikes, post.id, true);
    expect(controls.updatePending).toHaveBeenNthCalledWith(2, controls.setPendingLikes, post.id, false);
    expect(controls.logger.warn).toHaveBeenCalled();
  });
});
