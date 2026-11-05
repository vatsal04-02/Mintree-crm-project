import type { Row } from "@/api/frappe";

/**
 * Unsaved documents produced by ERPNext's mapping methods (e.g. Purchase Order -> Purchase
 * Receipt), handed from one screen to the form that edits them. Lost on reload, by design: the
 * form then starts from the source document again.
 */
const drafts = new Map<string, Row>();
let seq = 0;

export function putDraft(doc: Row): string {
  seq += 1;
  const id = `d${Date.now().toString(36)}${seq}`;
  drafts.set(id, doc);
  return id;
}

export function takeDraft(id: string | undefined): Row | undefined {
  return id ? drafts.get(id) : undefined;
}
