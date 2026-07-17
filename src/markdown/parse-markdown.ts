import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface MarkdownParserAdapter {
  parse(source: string): Root;
}

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).freeze();

export const markdownParser: MarkdownParserAdapter = Object.freeze({
  parse(source: string): Root {
    return markdownProcessor.parse(source);
  },
});

export function parseMarkdown(source: string): Root {
  return markdownParser.parse(source);
}
