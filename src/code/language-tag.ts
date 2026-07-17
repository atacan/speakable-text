export type CodeLanguageRoute = "python" | "typescript" | "fallback";

const PYTHON_TAGS: ReadonlySet<string> = new Set(["python", "py", "python3"]);
const TYPESCRIPT_TAGS: ReadonlySet<string> = new Set(["typescript", "ts"]);

export function routeCodeLanguage(tag: string | null | undefined): CodeLanguageRoute {
  const normalized = tag?.trim().toLowerCase() ?? "";
  if (PYTHON_TAGS.has(normalized)) return "python";
  if (TYPESCRIPT_TAGS.has(normalized)) return "typescript";
  return "fallback";
}
