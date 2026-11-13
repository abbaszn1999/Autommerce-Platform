// Google Ads plans and reports are shown by the Google Ads page, not by the
// chat. The page registers here: the chat's document cards open through it, and
// a document Vera just saved is announced to it.

export type SavedDoc = { docId: string; kind: "plan" | "report"; title: string; version: number };

let opener: ((docId: string) => void) | null = null;
let listener: ((doc: SavedDoc) => void) | null = null;

export function setDocHandlers(handlers: { open: (docId: string) => void; saved: (doc: SavedDoc) => void } | null) {
  opener = handlers?.open ?? null;
  listener = handlers?.saved ?? null;
}

export const canOpenDocs = () => !!opener;

export function openAgentDoc(docId: string) {
  opener?.(docId);
}

export function announceDoc(doc: SavedDoc) {
  listener?.(doc);
}
