import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

import {
  findActiveMention,
  searchMentionCandidatesByScreenName,
  type MentionCandidate,
  type MentionMatch,
} from "../utils/mentions";

export interface UseMentionAutocompleteOptions {
  value: string;
  onChange: (nextValue: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  candidates?: MentionCandidate[];
  fetchCandidates?: (query: string, limit: number) => Promise<MentionCandidate[]>;
  limit?: number;
  listIdPrefix?: string;
  onMentionInserted?: (details: { candidate: MentionCandidate; mentionText: string }) => void;
}

export interface UseMentionAutocompleteResult {
  mentionActive: boolean;
  mentionResults: MentionCandidate[];
  mentionHighlightIndex: number;
  setMentionHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  listId: string;
  activeOptionId: string | undefined;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean;
  handleMentionSelection: (candidate: MentionCandidate) => void;
  updateMentionState: (text: string, caretPosition: number | null | undefined) => void;
  closeMention: () => void;
}

export const useMentionAutocomplete = ({
  value,
  onChange,
  textareaRef,
  candidates = [],
  fetchCandidates,
  limit = 5,
  listIdPrefix = "mention-options",
  onMentionInserted,
}: UseMentionAutocompleteOptions): UseMentionAutocompleteResult => {
  const mentionDebounceRef = useRef<number | null>(null);
  const mentionFetchSequenceRef = useRef(0);
  const mentionRangeRef = useRef<MentionMatch | null>(null);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionRange, setMentionRange] = useState<MentionMatch | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionCandidate[]>([]);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);

  useEffect(() => {
    mentionRangeRef.current = mentionRange;
  }, [mentionRange]);

  const closeMention = useCallback(() => {
    if (typeof window !== "undefined" && mentionDebounceRef.current !== null) {
      window.clearTimeout(mentionDebounceRef.current);
      mentionDebounceRef.current = null;
    }
    mentionFetchSequenceRef.current += 1;
    setMentionActive(false);
    setMentionQuery("");
    setMentionRange(null);
    setMentionResults([]);
    setMentionHighlightIndex(0);
    mentionRangeRef.current = null;
  }, []);

  const updateMentionState = useCallback(
    (text: string, caretPosition: number | null | undefined) => {
      if (typeof caretPosition !== "number") {
        closeMention();
        return;
      }
      const match = findActiveMention(text, caretPosition);
      if (!match) {
        closeMention();
        return;
      }
      setMentionActive(true);
      setMentionRange(match);
      setMentionQuery(match.query);
    },
    [closeMention],
  );

  const computeMentionResults = useCallback(
    async (query: string) => {
      const searchLocal = () => searchMentionCandidatesByScreenName(candidates, query, limit);

      if (fetchCandidates) {
        let remoteResults: MentionCandidate[] = [];
        try {
          const fetched = await fetchCandidates(query, limit);
          if (Array.isArray(fetched)) {
            remoteResults = fetched.filter(Boolean).slice(0, limit);
          }
        } catch {
          remoteResults = [];
        }

        if (remoteResults.length >= limit || candidates.length === 0) {
          return remoteResults.slice(0, limit);
        }

        const seen = new Set(remoteResults.map((candidate) => candidate.pubkey));
        const localResults = searchLocal().filter((candidate) => !seen.has(candidate.pubkey));
        return [...remoteResults, ...localResults].slice(0, limit);
      }

      return searchLocal();
    },
    [candidates, fetchCandidates, limit],
  );

  useEffect(() => {
    if (!mentionActive) {
      if (typeof window !== "undefined" && mentionDebounceRef.current !== null) {
        window.clearTimeout(mentionDebounceRef.current);
        mentionDebounceRef.current = null;
      }
      setMentionResults((previous) => (previous.length === 0 ? previous : []));
      setMentionHighlightIndex((previous) => (previous === 0 ? previous : 0));
      return;
    }

    const applyResults = async () => {
      const requestId = mentionFetchSequenceRef.current + 1;
      mentionFetchSequenceRef.current = requestId;
      const results = await computeMentionResults(mentionQuery);
      if (mentionFetchSequenceRef.current !== requestId) {
        return;
      }
      setMentionResults(results);
      setMentionHighlightIndex((prev) => {
        if (results.length === 0) {
          return 0;
        }
        return Math.min(prev, results.length - 1);
      });
    };

    if (typeof window === "undefined") {
      void applyResults();
      return;
    }

    if (mentionDebounceRef.current !== null) {
      window.clearTimeout(mentionDebounceRef.current);
    }

    mentionDebounceRef.current = window.setTimeout(() => {
      void applyResults();
      mentionDebounceRef.current = null;
    }, 300);

    return () => {
      if (mentionDebounceRef.current !== null) {
        window.clearTimeout(mentionDebounceRef.current);
        mentionDebounceRef.current = null;
      }
    };
  }, [computeMentionResults, mentionActive, mentionQuery]);

  useEffect(() => {
    if (!mentionActive) return;
    setMentionHighlightIndex(0);
  }, [mentionActive, mentionQuery]);

  useEffect(() => {
    if (!mentionActive) return;
    setMentionHighlightIndex((prev) => {
      if (mentionResults.length === 0) {
        return 0;
      }
      return Math.min(prev, mentionResults.length - 1);
    });
  }, [mentionActive, mentionResults]);

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && mentionDebounceRef.current !== null) {
        window.clearTimeout(mentionDebounceRef.current);
        mentionDebounceRef.current = null;
      }
    },
    [],
  );

  const handleMentionSelection = useCallback(
    (candidate: MentionCandidate) => {
      const range = mentionRangeRef.current;
      const node = textareaRef.current;
      const existingValue = node?.value ?? value;
      if (!range) {
        return;
      }
      const baseHandle = candidate.screenName.trim();
      if (!baseHandle) {
        return;
      }
      const sanitizedHandle = baseHandle.replace(/[^A-Za-z0-9._-]/g, "");
      if (!sanitizedHandle) {
        return;
      }
      const handleText = sanitizedHandle;
      const mentionText = `@${handleText}`;
      const before = existingValue.slice(0, range.start);
      const after = existingValue.slice(range.end);
      const shouldInsertSpace =
        after.length === 0 || !/^[\s.,!?;:)}\]]/.test(after[0] ?? "");
      const insertion = shouldInsertSpace ? `${mentionText} ` : mentionText;
      const nextValue = `${before}${insertion}${after}`;
      onChange(nextValue);
      closeMention();
      const cursor = before.length + mentionText.length + (shouldInsertSpace ? 1 : 0);
      const focusTextarea = () => {
        const target = textareaRef.current;
        if (!target) return;
        target.focus();
        try {
          target.setSelectionRange(cursor, cursor);
        } catch {
          // ignore selection errors
        }
      };
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(focusTextarea);
      } else {
        focusTextarea();
      }
      onMentionInserted?.({ candidate, mentionText });
    },
    [closeMention, onChange, onMentionInserted, textareaRef, value],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionActive) {
        return false;
      }

      if (mentionResults.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setMentionHighlightIndex((prev) => (prev + 1) % mentionResults.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setMentionHighlightIndex((prev) => (prev === 0 ? mentionResults.length - 1 : prev - 1));
          return true;
        }
        if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
          event.preventDefault();
          const candidate = mentionResults[mentionHighlightIndex];
          if (candidate) {
            handleMentionSelection(candidate);
          }
          return true;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeMention();
        return true;
      }

      return false;
    },
    [closeMention, handleMentionSelection, mentionActive, mentionHighlightIndex, mentionResults],
  );

  const id = useId();
  const listId = useMemo(() => `${listIdPrefix}-${id}`, [id, listIdPrefix]);

  const activeOptionId = useMemo(() => {
    if (!mentionActive) return undefined;
    const candidate = mentionResults[mentionHighlightIndex];
    if (!candidate) return undefined;
    return `${listId}-${candidate.pubkey}`;
  }, [listId, mentionActive, mentionHighlightIndex, mentionResults]);

  return {
    mentionActive,
    mentionResults,
    mentionHighlightIndex,
    setMentionHighlightIndex,
    listId,
    activeOptionId,
    handleKeyDown,
    handleMentionSelection,
    updateMentionState,
    closeMention,
  };
};

export default useMentionAutocomplete;
