export type NarrationRole =
  | "narrator"
  | "heading"
  | "emphasis"
  | "strong-emphasis"
  | "inline-code"
  | "code"
  | "code-comment"
  | "quotation"
  | "list-item"
  | "table"
  | "table-header"
  | "table-cell"
  | "image"
  | "warning"
  | (string & {});

export type NarrationTone =
  | "neutral"
  | "calm"
  | "serious"
  | "excited"
  | "monotone"
  | "rushed"
  | (string & {});

export type NarrationRate =
  | "very-slow"
  | "slow"
  | "normal"
  | "fast"
  | "very-fast"
  | (string & {});

export type NarrationEmphasis =
  | "reduced"
  | "moderate"
  | "strong"
  | (string & {});

export interface NarrationStyle {
  role?: NarrationRole;
  tone?: NarrationTone;
  rate?: NarrationRate;
  emphasis?: NarrationEmphasis;
}

export interface TextNarrationToken {
  kind: "text";
  value: string;
  style?: NarrationStyle;
  literal?: boolean;
}

export interface PauseNarrationToken {
  kind: "pause";
  durationMs: number;
}

export interface BoundaryNarrationToken {
  kind: "boundary";
  boundary:
    | "document"
    | "heading"
    | "paragraph"
    | "list"
    | "list-item"
    | "blockquote"
    | "code-block"
    | "table"
    | "table-row"
    | "table-cell";
  phase: "start" | "end";
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export type NarrationFragment = TextNarrationToken | PauseNarrationToken;
export type NarrationToken = NarrationFragment | BoundaryNarrationToken;

export interface NarrationPlan {
  readonly schemaVersion: 1;
  readonly tokens: readonly NarrationToken[];
}
