const WORD_BOUNDARIES = /([a-z0-9])([A-Z])/gu;
const ACRONYM_BOUNDARIES = /([A-Z]+)([A-Z][a-z])/gu;
const ACRONYM = /^[A-Z]{2,}$/u;

function spokenWord(word: string, index: number): string {
  if (word === "id" || word === "ID") return "I D";
  if (ACRONYM.test(word)) return Array.from(word).join(" ");
  if (index > 0 && /^[A-Z][a-z]+$/u.test(word)) {
    return `${word[0]?.toLowerCase() ?? ""}${word.slice(1)}`;
  }
  return word;
}

/** Deterministically turn a source identifier into words without locale APIs. */
export function normalizeIdentifier(identifier: string): string {
  const dunder = /^__([^_][\s\S]*?)__$/u.exec(identifier);
  if (dunder !== null) return `dunder ${normalizeIdentifier(dunder[1] ?? "")}`.trim();

  const withoutPrivacyPrefix = identifier.replace(/^_+/u, "");
  const pieces = withoutPrivacyPrefix
    .replace(ACRONYM_BOUNDARIES, "$1 $2")
    .replace(WORD_BOUNDARIES, "$1 $2")
    .split(/[_-]+|\s+/u)
    .filter(Boolean);
  return pieces.map(spokenWord).join(" ");
}
