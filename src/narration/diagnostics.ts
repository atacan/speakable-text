export type DiagnosticSeverity = "info" | "warning" | "error";

export interface NarrationDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
}

export function createNarrationDiagnostic(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
): NarrationDiagnostic {
  return { code, severity, message };
}

/**
 * Adds a diagnostic on its first occurrence while preserving encounter order.
 * The caller owns the key so it can implement the renderer contract's
 * code-and-feature deduplication without adding renderer details to the public
 * diagnostic wire format.
 */
export function appendDiagnosticOnce(
  diagnostics: NarrationDiagnostic[],
  seenKeys: Set<string>,
  key: string,
  diagnostic: NarrationDiagnostic,
): void {
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  diagnostics.push(diagnostic);
}
