import type { EditorView } from 'prosemirror-view';
import * as prosemirrorView from 'prosemirror-view/dist/index.js';

type SerializeForClipboard = (
  view: EditorView,
  slice: unknown,
  textOnly?: boolean,
) => {
  dom: DocumentFragment;
  text: string;
};

type ProsemirrorExports = typeof prosemirrorView & {
  __serializeForClipboard?: SerializeForClipboard;
  serializeForClipboard?: SerializeForClipboard;
};

const { __serializeForClipboard, serializeForClipboard } = prosemirrorView as ProsemirrorExports;

export const __serializeForClipboard: SerializeForClipboard =
  __serializeForClipboard ??
  serializeForClipboard ??
  ((..._args) => {
    throw new Error('Clipboard serialization is unavailable in this build.');
  });

export * from 'prosemirror-view/dist/index.js';
