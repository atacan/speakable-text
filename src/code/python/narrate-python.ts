import type { SyntaxNode, Tree } from "@lezer/common";
import type { NarrationFragment, NarrationStyle } from "../../narration/tokens.js";
import { normalizeIdentifier } from "../identifier.js";
import { narrateLexicalCode } from "../narrate-lexical-code.js";
import type { OperatorPhrasebook } from "../operators.js";

export interface PythonNarrationOptions {
  readonly operators: OperatorPhrasebook;
  readonly style: NarrationStyle;
  readonly commentStyle: NarrationStyle;
  readonly linePauseMs: number;
}

export interface PythonNarrationResult {
  readonly fragments: readonly NarrationFragment[];
  readonly usedLiteralFallback: boolean;
}

interface Context {
  readonly source: string;
  readonly options: PythonNarrationOptions;
  usedLiteralFallback: boolean;
}

const SMALL_NUMBERS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
] as const;

function text(node: SyntaxNode, context: Context): string {
  return context.source.slice(node.from, node.to);
}

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) result.push(child);
  return result;
}

function spokenNumber(value: string): string {
  const number = Number(value.replaceAll("_", ""));
  return Number.isInteger(number) && number >= 0 && number <= 20 ? SMALL_NUMBERS[number] ?? value : value;
}

function spokenString(value: string): string {
  const quote = value.match(/^(?:[rubf]+)?(["']{1,3})/iu)?.[1];
  if (quote === undefined) return `the string ${value}`;
  const content = value.slice(value.indexOf(quote) + quote.length, value.endsWith(quote) ? -quote.length : undefined);
  return `the string ${content}`;
}

function typeExpression(node: SyntaxNode, context: Context): string | undefined {
  if (node.name === "TypeDef") {
    const value = children(node).find((child) => child.name !== ":");
    return value === undefined ? undefined : typeExpression(value, context);
  }
  if (node.name === "VariableName" || node.name === "PropertyName") {
    const raw = text(node, context);
    return ({ int: "integer", str: "string", bool: "boolean", float: "float" } as Record<string, string>)[raw]
      ?? normalizeIdentifier(raw);
  }
  if (node.name === "MemberExpression") {
    const parts = children(node);
    const bracket = parts.findIndex((part) => part.name === "[");
    if (bracket >= 0) {
      const base = typeExpression(parts[0]!, context);
      const item = parts.slice(bracket + 1).find((part) => part.name !== "]");
      const argument = item === undefined ? undefined : typeExpression(item, context);
      return base === undefined || argument === undefined ? undefined : `${base} of ${argument}`;
    }
    const values = parts.filter((part) => part.name === "VariableName" || part.name === "PropertyName");
    return values.map((part) => normalizeIdentifier(text(part, context))).join(" ");
  }
  return undefined;
}

function joinNatural(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function expression(node: SyntaxNode, context: Context): string | undefined {
  switch (node.name) {
    case "VariableName":
    case "PropertyName": return normalizeIdentifier(text(node, context));
    case "Number": return spokenNumber(text(node, context));
    case "String": return spokenString(text(node, context));
    case "Boolean": return text(node, context).toLowerCase();
    case "None": return "None";
    case "ParenthesizedExpression": {
      const inner = children(node).find((child) => child.name !== "(" && child.name !== ")");
      return inner === undefined ? undefined : expression(inner, context);
    }
    case "ArrayExpression": {
      const items = children(node).filter((child) => child.name !== "[" && child.name !== "]" && child.name !== ",");
      const spoken = items.map((item) => expression(item, context));
      if (spoken.some((item) => item === undefined)) return undefined;
      if (spoken.length === 0) return "an empty list";
      const values = spoken as string[];
      const allStrings = items.every((item) => item.name === "String");
      const strings = values.map((value) => value.replace(/^the string /u, ""));
      return `a list containing ${allStrings ? `${strings.length === 1 ? "the string" : "the strings"} ${strings.join(" and ")}` : joinNatural(values)}`;
    }
    case "TupleExpression":
    case "SetExpression": {
      const opening = node.name === "TupleExpression" ? "(" : "{";
      const closing = node.name === "TupleExpression" ? ")" : "}";
      const items = children(node).filter((child) => ![opening, closing, ","].includes(child.name));
      const spoken = items.map((item) => expression(item, context));
      if (spoken.some((item) => item === undefined)) return undefined;
      const collection = node.name === "TupleExpression" ? "tuple" : "set";
      return spoken.length === 0 ? `an empty ${collection}` : `a ${collection} containing ${joinNatural(spoken as string[])}`;
    }
    case "DictionaryExpression": {
      const parts = children(node).filter((child) => !["{", "}", ",", ":"].includes(child.name));
      if (parts.length === 0) return "an empty dictionary";
      if (parts.length % 2 !== 0) return undefined;
      const entries: string[] = [];
      for (let index = 0; index < parts.length; index += 2) {
        const key = expression(parts[index]!, context);
        const value = expression(parts[index + 1]!, context);
        if (key === undefined || value === undefined) return undefined;
        entries.push(`${key} mapped to ${value}`);
      }
      return `a dictionary containing ${joinNatural(entries)}`;
    }
    case "MemberExpression": {
      const parts = children(node);
      const base = expression(parts[0]!, context);
      if (base === undefined) return undefined;
      const bracket = parts.findIndex((part) => part.name === "[");
      if (bracket >= 0) {
        const index = parts.slice(bracket + 1).find((part) => part.name !== "]");
        const spokenIndex = index === undefined ? undefined : expression(index, context);
        return spokenIndex === undefined ? undefined : `${base} at ${spokenIndex}`;
      }
      const property = parts.find((part) => part.name === "PropertyName");
      return property === undefined ? undefined : `${base} ${normalizeIdentifier(text(property, context))}`;
    }
    case "CallExpression": {
      const parts = children(node);
      const callee = expression(parts[0]!, context);
      const argsNode = parts.find((part) => part.name === "ArgList");
      if (callee === undefined || argsNode === undefined) return undefined;
      const args = children(argsNode).filter((part) => !["(", ")", ","].includes(part.name)).map((part) => expression(part, context));
      if (args.some((arg) => arg === undefined)) return undefined;
      if (callee === "len" && args.length === 1) return `the length of ${args[0]}`;
      return `call ${callee}${args.length === 0 ? "" : ` with ${joinNatural(args as string[])}`}`;
    }
    case "UnaryExpression": {
      const parts = children(node);
      const operand = expression(parts.at(-1)!, context);
      const rawOperator = text(parts[0]!, context);
      const phrase = context.options.operators[rawOperator as keyof OperatorPhrasebook];
      return operand === undefined || phrase === undefined ? undefined : `${phrase} ${operand}`;
    }
    case "BinaryExpression": {
      const parts = children(node);
      const left = expression(parts[0]!, context);
      const right = expression(parts.at(-1)!, context);
      const operatorNode = parts.slice(1, -1).find((part) => ["CompareOp", "ArithOp", "and", "or"].includes(part.name));
      const rawOperator = operatorNode === undefined ? "" : text(operatorNode, context);
      const phrase = context.options.operators[rawOperator as keyof OperatorPhrasebook];
      return left === undefined || right === undefined || phrase === undefined ? undefined : `${left} ${phrase} ${right}`;
    }
    default: return undefined;
  }
}

function fallback(node: SyntaxNode, context: Context): NarrationFragment[] {
  context.usedLiteralFallback = true;
  return [...narrateLexicalCode(text(node, context), context.options)];
}

function semantic(value: string, context: Context, comment = false): NarrationFragment[] {
  return [{ kind: "text", value: `${value}.`, style: comment ? context.options.commentStyle : context.options.style }];
}

function bodyFragments(node: SyntaxNode, context: Context): NarrationFragment[] {
  const fragments: NarrationFragment[] = [];
  for (const child of children(node)) {
    if (child.name === ":") continue;
    const statement = statementFragments(child, context);
    if (statement.length === 0) continue;
    if (fragments.length > 0) fragments.push({ kind: "pause", durationMs: context.options.linePauseMs });
    fragments.push(...statement);
  }
  return fragments;
}

function appendSegment(
  target: NarrationFragment[],
  segment: readonly NarrationFragment[],
  pauseMs: number,
): void {
  if (segment.length === 0) return;
  if (target.length > 0) target.push({ kind: "pause", durationMs: pauseMs });
  target.push(...segment);
}

function ifFragments(node: SyntaxNode, context: Context): NarrationFragment[] | undefined {
  const parts = children(node);
  const fragments: NarrationFragment[] = [];
  let index = 0;
  if (parts[index]?.name !== "if") return undefined;

  while (index < parts.length) {
    const keyword = parts[index];
    if (keyword?.name === "if" || keyword?.name === "elif") {
      const conditionNode = parts[index + 1];
      const body = parts[index + 2];
      if (conditionNode === undefined || body?.name !== "Body") return undefined;
      const condition = expression(conditionNode, context);
      if (condition === undefined) return undefined;
      appendSegment(
        fragments,
        semantic(`${keyword.name === "if" ? "If" : "Otherwise if"} ${condition}, then`, context),
        context.options.linePauseMs,
      );
      appendSegment(fragments, bodyFragments(body, context), context.options.linePauseMs);
      index += 3;
      continue;
    }
    if (keyword?.name === "else") {
      const body = parts[index + 1];
      if (body?.name !== "Body" || index + 2 !== parts.length) return undefined;
      appendSegment(fragments, semantic("Otherwise", context), context.options.linePauseMs);
      appendSegment(fragments, bodyFragments(body, context), context.options.linePauseMs);
      index += 2;
      continue;
    }
    return undefined;
  }
  return fragments;
}

function assignment(node: SyntaxNode, context: Context): string | undefined {
  const parts = children(node);
  if (parts.filter((part) => part.name === "AssignOp").length > 1) return undefined;
  const operatorIndex = parts.findIndex((part) => part.name === "AssignOp");
  if (operatorIndex === -1) {
    const target = expression(parts[0]!, context);
    const annotation = parts.find((part) => part.name === "TypeDef");
    const spokenType = annotation === undefined ? undefined : typeExpression(annotation, context);
    return target === undefined || spokenType === undefined ? undefined : `Declare ${target} of type ${spokenType}`;
  }
  if (operatorIndex === 0) return undefined;
  const target = expression(parts[0]!, context);
  const value = expression(parts[operatorIndex + 1]!, context);
  if (target === undefined || value === undefined) return undefined;
  const annotation = parts.slice(1, operatorIndex).find((part) => part.name === "TypeDef");
  const spokenType = annotation === undefined ? undefined : typeExpression(annotation, context);
  if (annotation !== undefined && spokenType === undefined) return undefined;
  const assignmentValue = value.startsWith("call ") ? `the result of calling ${value.slice(5)}` : value;
  return `Set ${target}${spokenType === undefined ? "" : ` of type ${spokenType}`} to ${assignmentValue}`;
}

function functionFragments(node: SyntaxNode, context: Context): NarrationFragment[] | undefined {
  const parts = children(node);
  if (parts.some((part) => part.name === "async")) return undefined;
  const name = parts.find((part) => part.name === "VariableName");
  const params = parts.find((part) => part.name === "ParamList");
  const body = parts.find((part) => part.name === "Body");
  if (name === undefined || params === undefined || body === undefined) return undefined;
  const paramParts = children(params).filter((part) => !["(", ")", ","].includes(part.name));
  const spokenParams: string[] = [];
  for (let index = 0; index < paramParts.length;) {
    const parameter = paramParts[index];
    if (parameter?.name === "*" || parameter?.name === "**") return undefined;
    if (parameter?.name !== "VariableName") return undefined;
    let value = normalizeIdentifier(text(parameter, context));
    index += 1;
    if (paramParts[index]?.name === "TypeDef") {
      const spokenType = typeExpression(paramParts[index]!, context);
      if (spokenType === undefined) return undefined;
      value += ` of type ${spokenType}`;
      index += 1;
    }
    if (paramParts[index]?.name === "AssignOp") {
      const defaultValue = expression(paramParts[index + 1]!, context);
      if (defaultValue === undefined) return undefined;
      value += ` defaulting to ${defaultValue}`;
      index += 2;
    }
    spokenParams.push(value);
  }
  const returnType = parts.find((part) => part.name === "TypeDef");
  const spokenReturn = returnType === undefined ? undefined : typeExpression(returnType, context);
  if (returnType !== undefined && spokenReturn === undefined) return undefined;
  const header = `Define function ${normalizeIdentifier(text(name, context))}. ${spokenParams.length === 0 ? "It takes no parameters" : `It takes ${joinNatural(spokenParams)}`}${spokenReturn === undefined ? "" : `. It returns ${spokenReturn}`}`;
  const nested = bodyFragments(body, context);
  return [...semantic(header, context), ...(nested.length === 0 ? [] : [{ kind: "pause", durationMs: context.options.linePauseMs } as const, ...nested])];
}

function statementFragments(node: SyntaxNode, context: Context): NarrationFragment[] {
  switch (node.name) {
    case "Comment": return semantic(`Comment. ${text(node, context).replace(/^\s*#/u, "").trim()}`, context, true);
    case "ImportStatement": {
      const parts = children(node);
      const fromIndex = parts.findIndex((part) => part.name === "from");
      const importIndex = parts.findIndex((part) => part.name === "import");
      if (fromIndex >= 0 && importIndex > fromIndex) {
        const module = parts.slice(fromIndex + 1, importIndex).filter((part) => part.name === "VariableName").map((part) => normalizeIdentifier(text(part, context))).join(" ");
        const names = parts.slice(importIndex + 1).filter((part) => part.name === "VariableName").map((part) => normalizeIdentifier(text(part, context)));
        return semantic(`From ${module} import ${joinNatural(names)}`, context);
      }
      const names = parts.filter((part) => part.name === "VariableName").map((part) => normalizeIdentifier(text(part, context)));
      return names.length === 0 ? fallback(node, context) : semantic(`Import ${joinNatural(names)}`, context);
    }
    case "AssignStatement": {
      const value = assignment(node, context);
      return value === undefined ? fallback(node, context) : semantic(value, context);
    }
    case "UpdateStatement": {
      const parts = children(node);
      const target = expression(parts[0]!, context);
      const value = expression(parts.at(-1)!, context);
      const operator = parts.find((part) => part.name === "UpdateOp");
      const phrase = operator === undefined ? undefined : context.options.operators[text(operator, context) as keyof OperatorPhrasebook];
      if (target === undefined || value === undefined || phrase === undefined) return fallback(node, context);
      const verb = phrase.replace(/ by$/u, "");
      return semantic(`${verb[0]?.toUpperCase()}${verb.slice(1)} ${target} by ${value}`, context);
    }
    case "FunctionDefinition": return functionFragments(node, context) ?? fallback(node, context);
    case "ExpressionStatement": {
      const value = expression(node.firstChild ?? node, context);
      if (value === undefined) return fallback(node, context);
      return semantic(value[0]?.toUpperCase() + value.slice(1), context);
    }
    case "ReturnStatement": {
      const valueNode = children(node).find((child) => child.name !== "return");
      const value = valueNode === undefined ? undefined : expression(valueNode, context);
      return valueNode !== undefined && value === undefined ? fallback(node, context) : semantic(`Return${value === undefined ? "" : ` ${value}`}`, context);
    }
    case "ForStatement":
    case "WhileStatement": {
      const parts = children(node);
      const body = parts.find((part) => part.name === "Body");
      if (body === undefined) return fallback(node, context);
      let header: string | undefined;
      if (node.name === "ForStatement") {
        const inIndex = parts.findIndex((part) => part.name === "in");
        const item = inIndex > 0 ? expression(parts[inIndex - 1]!, context) : undefined;
        const iterable = inIndex >= 0 ? expression(parts[inIndex + 1]!, context) : undefined;
        if (item !== undefined && iterable !== undefined) header = `For each ${item} in ${iterable}`;
      } else {
        const condition = parts.slice(1).find((part) => part.name !== "Body");
        const spokenCondition = condition === undefined ? undefined : expression(condition, context);
        if (spokenCondition !== undefined) header = `While ${spokenCondition}`;
      }
      if (header === undefined) return fallback(node, context);
      const nested = bodyFragments(body, context);
      return [...semantic(header, context), ...(nested.length === 0 ? [] : [{ kind: "pause", durationMs: context.options.linePauseMs } as const, ...nested])];
    }
    case "IfStatement": {
      return ifFragments(node, context) ?? fallback(node, context);
    }
    default: return fallback(node, context);
  }
}

export function narratePython(
  source: string,
  tree: Tree,
  options: PythonNarrationOptions,
): PythonNarrationResult {
  const context: Context = { source, options, usedLiteralFallback: false };
  const fragments: NarrationFragment[] = [];
  for (const node of children(tree.topNode)) {
    const statement = statementFragments(node, context);
    if (statement.length === 0) continue;
    if (fragments.length > 0) fragments.push({ kind: "pause", durationMs: options.linePauseMs });
    fragments.push(...statement);
  }
  return { fragments, usedLiteralFallback: context.usedLiteralFallback };
}
