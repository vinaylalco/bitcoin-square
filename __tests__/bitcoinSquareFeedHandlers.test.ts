/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";

import {
  createFeedActionHandlers,
  createOpenComposerDialog,
} from "../src/components/bitcoinSquareChat/feedActions";
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

    const openComposerDialog = createOpenComposerDialog({
      setComposerMode,
      setComposerTarget,
      setContent,
      setComposerError,
      setComposerOpen,
      shortenPubkey,
    });

    return {
      openComposerDialog,
      setComposerMode,
      setComposerTarget,
      setContent,
      setComposerError,
      setComposerOpen,
      shortenPubkey,
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
  });

  it("quotes each line when quoting a post", () => {
    const controls = setup();
    controls.openComposerDialog("quote", basePost);

    expect(controls.setComposerMode).toHaveBeenCalledWith("quote");
    expect(controls.setComposerTarget).toHaveBeenCalledWith(basePost);
    expect(controls.setContent).toHaveBeenCalledWith("> First line\n> Second line\n\n");
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

  it("opens the composer for new, reply, and quote actions", () => {
    const controls = setup(async () => {});

    controls.handlers.handlePost();
    expect(controls.openComposerDialog).toHaveBeenCalledWith("new");

    controls.handlers.handleReply(post);
    expect(controls.openComposerDialog).toHaveBeenCalledWith("reply", post);

    controls.handlers.handleQuote(post);
    expect(controls.openComposerDialog).toHaveBeenCalledWith("quote", post);
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
