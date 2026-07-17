import { parsePython } from "../code/python/parse-python.js";
import { parseTypeScript } from "../code/typescript/parse-typescript.js";
import { parseMarkdown } from "../markdown/parse-markdown.js";

export interface ParserSmokeResult {
  readonly markdownText: string;
  readonly markdownRootKind: string;
  readonly pythonRootKind: string;
  readonly typescriptRootKind: string;
}

export function runParserSmoke(): ParserSmokeResult {
  const markdown = parseMarkdown("Worker &copy; entity");
  const paragraph = markdown.children[0];
  const text = paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
  const python = parsePython("value: int = 1");
  const typescript = parseTypeScript("const value: number = 1;");

  return {
    markdownText: text?.type === "text" ? text.value : "",
    markdownRootKind: markdown.type,
    pythonRootKind: python.tree.type.name,
    typescriptRootKind: typescript.tree.type.name,
  };
}
