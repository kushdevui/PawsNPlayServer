/**
 * Structure of a versioned waiver. The app renders it block by block; `**text**` marks bold lead-ins.
 * Never edit a published version: add a new file (e.g. v2027-01.ts) and point CURRENT_WAIVER at it.
 */
export type WaiverBlock =
  | { type: 'paragraph'; text: string }
  /** A highlighted box. `note` = the italic callout inside it; `extra` = text after the note; `items` = bullets. */
  | { type: 'card'; title?: string; text: string; note?: string; extra?: string; items?: string[] }
  | { type: 'bullets'; title?: string; items: string[] }
  | { type: 'numbered'; intro: string; items: string[] }
  | { type: 'rates'; title: string; text: string; items: Array<{ price: string; label: string }> }
  /** A bold authorisation / agreement line. */
  | { type: 'statement'; text: string };

export interface WaiverPart {
  id: string;
  label: 'Part A' | 'Part B' | null;
  title: string;
  blocks: WaiverBlock[];
}

export interface WaiverContent {
  version: string;
  title: string;
  intro: string[];
  parts: WaiverPart[];
}

/** A checkbox the signer ticks. `shortLabel` is used in error messages ("Please tick: ..."). */
export interface WaiverConsent {
  key: string;
  label: string;
  shortLabel: string;
  required: boolean;
}

export interface WaiverDefinition {
  content: WaiverContent;
  consents: WaiverConsent[];
}
