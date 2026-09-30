import type { Root } from "mdast";
import { gfmTable } from "micromark-extension-gfm-table";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified, type Processor } from "unified";

export interface MarkdownParserAdapter {
  parse(source: string): Root;
}

function remarkGfmWithPinnedTables(this: Processor): void {
  remarkGfm.call(this);
  const extension = this.data().micromarkExtensions?.at(-1);
  if (extension === undefined) throw new Error("remark-gfm did not register its syntax extension");
  // Retain all GFM syntax and mdast handlers, but use our direct table
  // dependency. A consumer can still have remark-gfm's older transitive table
  // dependency in its lockfile; that version has quadratic edit lookups.
  extension.flow = { ...extension.flow, ...gfmTable().flow };
}

const markdownProcessor = unified().use(remarkParse).use(remarkGfmWithPinnedTables).freeze();

export const markdownParser: MarkdownParserAdapter = Object.freeze({
  parse(source: string): Root {
    return markdownProcessor.parse(source);
  },
});

export function parseMarkdown(source: string): Root {
  return markdownParser.parse(source);
}
