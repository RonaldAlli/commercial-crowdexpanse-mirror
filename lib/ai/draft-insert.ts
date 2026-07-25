// Draft-insert interface — the ONLY channel between the Copilot and workspace
// editors. The Copilot never writes into another component; it dispatches a request
// and an editor decides whether to replace, append, or reject. Ownership of editor
// state stays with the editor.
//
// Wire shape: a cancelable DOM CustomEvent. An editor "accepts" by calling accept()
// (which preventDefault()s); if no editor accepts, requestDraftInsert() returns false
// and the caller can fall back (e.g. copy to clipboard).

export type DraftInsertRequest = {
  text: string;
  channel?: string; // optional hint; the editor may ignore it
};

const DRAFT_INSERT_EVENT = "copilot:insert-draft";

// Copilot side. Returns true iff an editor accepted the request.
export function requestDraftInsert(request: DraftInsertRequest): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent<DraftInsertRequest>(DRAFT_INSERT_EVENT, {
    detail: request,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

// Editor side. `handler` inspects the request and calls `accept()` to claim it.
// Not calling accept() = reject (e.g. no active/enabled composer). Returns an
// unsubscribe function.
export function onDraftInsert(
  handler: (request: DraftInsertRequest, accept: () => void) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const ce = e as CustomEvent<DraftInsertRequest>;
    handler(ce.detail, () => e.preventDefault());
  };
  window.addEventListener(DRAFT_INSERT_EVENT, listener as EventListener);
  return () => window.removeEventListener(DRAFT_INSERT_EVENT, listener as EventListener);
}

// Pure default editor decision: replace when the field is empty, otherwise append
// after a blank line. Editors may implement their own policy instead.
export function mergeDraftText(current: string, incoming: string): string {
  return current.trim() === "" ? incoming : `${current}\n\n${incoming}`;
}
