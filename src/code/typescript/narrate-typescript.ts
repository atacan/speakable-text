import type { SyntaxNode, Tree } from "@lezer/common";
import type { NarrationFragment, NarrationStyle } from "../../narration/tokens.js";
import { normalizeIdentifier } from "../identifier.js";
import { narrateLexicalCode } from "../narrate-lexical-code.js";
import type { OperatorPhrasebook } from "../operators.js";

export interface TypeScriptNarrationOptions {
  readonly operators: OperatorPhrasebook;
  readonly style: NarrationStyle;
  readonly commentStyle: NarrationStyle;
  readonly linePauseMs: number;
}

export interface TypeScriptNarrationResult {
  readonly fragments: readonly NarrationFragment[];
  readonly usedLiteralFallback: boolean;
}

interface Context {
  readonly source: string;
  readonly options: TypeScriptNarrationOptions;
  usedLiteralFallback: boolean;
}

const SMALL_NUMBERS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
] as const;

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) result.push(child);
  return result;
}

function descendantsNamed(node: SyntaxNode, name: string): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (const child of children(node)) {
    if (child.name === name) result.push(child);
    result.push(...descendantsNamed(child, name));
  }
  return result;
}

function text(node: SyntaxNode, context: Context): string {
  return context.source.slice(node.from, node.to);
}

function joinNatural(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function spokenNumber(value: string): string {
  const number = Number(value.replaceAll("_", ""));
  return Number.isInteger(number) && number >= 0 && number <= 20 ? SMALL_NUMBERS[number] ?? value : value;
}

function spokenString(value: string): string {
  const quote = value[0];
  const content = quote === "\"" || quote === "'" || quote === "`" ? value.slice(1, -1) : value;
  return `the string ${content}`;
}

function typeExpression(node: SyntaxNode, context: Context): string | undefined {
  if (node.name === "TypeAnnotation") {
    const value = children(node).find((child) => child.name !== ":");
    return value === undefined ? undefined : typeExpression(value, context);
  }
  if (node.name === "TypeName" || node.name === "VariableName" || node.name === "PropertyName") {
    const raw = text(node, context);
    return ({ string: "string", number: "number", boolean: "boolean", unknown: "unknown", void: "void" } as Record<string, string>)[raw]
      ?? normalizeIdentifier(raw);
  }
  if (node.name === "ArrayType") {
    const item = children(node).find((child) => child.name !== "[" && child.name !== "]");
    const spoken = item === undefined ? undefined : typeExpression(item, context);
    return spoken === undefined ? undefined : `array of ${spoken}`;
  }
  return undefined;
}

function expression(node: SyntaxNode, context: Context): string | undefined {
  switch (node.name) {
    case "VariableName":
    case "VariableDefinition":
    case "PropertyName":
    case "PropertyDefinition": return normalizeIdentifier(text(node, context));
    case "Number": return spokenNumber(text(node, context));
    case "String": return spokenString(text(node, context));
    case "BooleanLiteral": return text(node, context).toLowerCase();
    case "null": return "null";
    case "ParenthesizedExpression": {
      const inner = children(node).find((child) => child.name !== "(" && child.name !== ")");
      return inner === undefined ? undefined : expression(inner, context);
    }
    case "ArrayExpression": {
      const items = children(node).filter((child) => !["[", "]", ","].includes(child.name));
      const spoken = items.map((item) => expression(item, context));
      if (spoken.some((item) => item === undefined)) return undefined;
      if (spoken.length === 0) return "an empty list";
      const values = spoken as string[];
      const allStrings = items.every((item) => item.name === "String");
      const strings = values.map((value) => value.replace(/^the string /u, ""));
      return `a list containing ${allStrings ? `${strings.length === 1 ? "the string" : "the strings"} ${strings.join(" and ")}` : joinNatural(values)}`;
    }
    case "ObjectExpression": {
      const properties = children(node).filter((child) => child.name === "Property");
      if (properties.length === 0) return "an empty object";
      const entries: string[] = [];
      for (const property of properties) {
        const parts = children(property).filter((child) => child.name !== ":");
        const key = expression(parts[0]!, context);
        const value = parts.length === 1 ? key : expression(parts[1]!, context);
        if (key === undefined || value === undefined) return undefined;
        entries.push(`${key} set to ${value}`);
      }
      return `an object containing ${joinNatural(entries)}`;
    }
    case "MemberExpression": {
      const parts = children(node);
      const base = expression(parts[0]!, context);
      if (base === undefined) return undefined;
      const bracket = parts.findIndex((part) => part.name === "[");
      if (bracket >= 0) {
        const index = parts.slice(bracket + 1).find((part) => part.name !== "]");
        const spoken = index === undefined ? undefined : expression(index, context);
        return spoken === undefined ? undefined : `${base} at ${spoken}`;
      }
      const property = parts.find((part) => part.name === "PropertyName");
      if (property === undefined) return undefined;
      const optional = parts.some((part) => part.name === "?.");
      return `${base}${optional ? ` ${context.options.operators["?."]}` : ""} ${normalizeIdentifier(text(property, context))}`;
    }
    case "CallExpression": {
      const parts = children(node);
      const callee = expression(parts[0]!, context);
      const argsNode = parts.find((part) => part.name === "ArgList");
      if (callee === undefined || argsNode === undefined) return undefined;
      const args = children(argsNode).filter((part) => !["(", ")", ","].includes(part.name)).map((part) => expression(part, context));
      return args.some((arg) => arg === undefined) ? undefined : `call ${callee}${args.length === 0 ? "" : ` with ${joinNatural(args as string[])}`}`;
    }
    case "UnaryExpression": {
      const parts = children(node);
      const operand = expression(parts.at(-1)!, context);
      const operator = text(parts[0]!, context);
      const phrase = context.options.operators[operator as keyof OperatorPhrasebook];
      return operand === undefined || phrase === undefined ? undefined : `${phrase} ${operand}`;
    }
    case "BinaryExpression": {
      const parts = children(node);
      const left = expression(parts[0]!, context);
      const right = expression(parts.at(-1)!, context);
      const operatorNode = parts[1];
      const phrase = operatorNode === undefined ? undefined : context.options.operators[text(operatorNode, context) as keyof OperatorPhrasebook];
      return left === undefined || right === undefined || phrase === undefined ? undefined : `${left} ${phrase} ${right}`;
    }
    default: return undefined;
  }
}

function semantic(value: string, context: Context, comment = false): NarrationFragment[] {
  return [{ kind: "text", value: `${value}.`, style: comment ? context.options.commentStyle : context.options.style }];
}

function fallback(node: SyntaxNode, context: Context): NarrationFragment[] {
  context.usedLiteralFallback = true;
  return [...narrateLexicalCode(text(node, context), context.options)];
}

function appendSegment(target: NarrationFragment[], segment: readonly NarrationFragment[], pauseMs: number): void {
  if (segment.length === 0) return;
  if (target.length > 0) target.push({ kind: "pause", durationMs: pauseMs });
  target.push(...segment);
}

function blockFragments(node: SyntaxNode, context: Context): NarrationFragment[] {
  const fragments: NarrationFragment[] = [];
  for (const child of children(node)) {
    if (child.name === "{" || child.name === "}") continue;
    appendSegment(fragments, statementFragments(child, context), context.options.linePauseMs);
  }
  return fragments;
}

function variableDeclaration(node: SyntaxNode, context: Context): NarrationFragment[] | undefined {
  const parts = children(node);
  const declarationKind = parts[0]?.name;
  if (!(["const", "let", "var"] as readonly string[]).includes(declarationKind ?? "")) return undefined;
  const fragments: NarrationFragment[] = [];
  let index = 1;
  while (index < parts.length && parts[index]?.name !== ";") {
    if (parts[index]?.name === ",") { index += 1; continue; }
    const nameNode = parts[index];
    if (nameNode?.name !== "VariableDefinition") return undefined;
    let spoken = `Set ${declarationKind === "const" ? "constant " : ""}${normalizeIdentifier(text(nameNode, context))}`;
    index += 1;
    if (parts[index]?.name === "TypeAnnotation") {
      const type = typeExpression(parts[index]!, context);
      if (type === undefined) return undefined;
      spoken += ` of type ${type}`;
      index += 1;
    }
    if (parts[index]?.name === "Equals") {
      const value = expression(parts[index + 1]!, context);
      if (value === undefined) return undefined;
      spoken += ` to ${value.startsWith("call ") ? `the result of calling ${value.slice(5)}` : value}`;
      index += 2;
    } else spoken = `Declare${declarationKind === "const" ? " constant" : ""} ${spoken.slice(spoken.indexOf(" ") + 1)}`;
    appendSegment(fragments, semantic(spoken, context), context.options.linePauseMs);
  }
  return fragments;
}

function assignmentExpression(node: SyntaxNode, context: Context): string | undefined {
  const parts = children(node);
  const target = expression(parts[0]!, context);
  const value = expression(parts.at(-1)!, context);
  const operator = parts[1];
  const raw = operator === undefined ? "" : text(operator, context);
  if (target === undefined || value === undefined) return undefined;
  if (raw === "=") return `Set ${target} to ${value.startsWith("call ") ? `the result of calling ${value.slice(5)}` : value}`;
  const phrase = context.options.operators[raw as keyof OperatorPhrasebook];
  if (phrase === undefined) return undefined;
  const verb = phrase.replace(/ by$/u, "");
  return `${verb[0]?.toUpperCase()}${verb.slice(1)} ${target} by ${value}`;
}

function updateExpression(node: SyntaxNode, context: Context): string | undefined {
  if (node.name === "AssignmentExpression") return assignmentExpression(node, context);
  if (node.name !== "PostfixExpression" && node.name !== "UnaryExpression") return undefined;
  const parts = children(node);
  const targetNode = parts.find((part) => part.name === "VariableName" || part.name === "MemberExpression");
  const operator = parts.find((part) => part.name === "ArithOp");
  const target = targetNode === undefined ? undefined : expression(targetNode, context);
  const raw = operator === undefined ? "" : text(operator, context);
  if (target === undefined || (raw !== "++" && raw !== "--")) return undefined;
  return `${raw === "++" ? "Increase" : "Decrease"} ${target} by one`;
}

function functionFragments(node: SyntaxNode, context: Context): NarrationFragment[] | undefined {
  const parts = children(node);
  if (parts.some((part) => part.name === "async")) return undefined;
  const name = parts.find((part) => part.name === "VariableDefinition");
  const params = parts.find((part) => part.name === "ParamList");
  const body = parts.find((part) => part.name === "Block");
  if (name === undefined || params === undefined || body === undefined) return undefined;
  const paramParts = children(params).filter((part) => !["(", ")", ","].includes(part.name));
  const spokenParams: string[] = [];
  for (let index = 0; index < paramParts.length;) {
    const parameter = paramParts[index];
    if (parameter?.name !== "VariableDefinition") return undefined;
    let spoken = normalizeIdentifier(text(parameter, context));
    index += 1;
    if (paramParts[index]?.name === "TypeAnnotation") {
      const type = typeExpression(paramParts[index]!, context);
      if (type === undefined) return undefined;
      spoken += ` of type ${type}`;
      index += 1;
    }
    spokenParams.push(spoken);
  }
  const returnNode = parts.find((part) => part.name === "TypeAnnotation");
  const returnType = returnNode === undefined ? undefined : typeExpression(returnNode, context);
  if (returnNode !== undefined && returnType === undefined) return undefined;
  const header = `Define function ${normalizeIdentifier(text(name, context))}. ${spokenParams.length === 0 ? "It takes no parameters" : `It takes ${joinNatural(spokenParams)}`}${returnType === undefined ? "" : `. It returns ${returnType}`}`;
  const nested = blockFragments(body, context);
  return [...semantic(header, context), ...(nested.length === 0 ? [] : [{ kind: "pause", durationMs: context.options.linePauseMs } as const, ...nested])];
}

function ifFragments(node: SyntaxNode, context: Context, otherwiseIf = false): NarrationFragment[] | undefined {
  const parts = children(node);
  const conditionNode = parts.find((part) => part.name === "ParenthesizedExpression");
  const bodyIndex = parts.findIndex((part) => part.name === "Block");
  const body = parts[bodyIndex];
  const condition = conditionNode === undefined ? undefined : expression(conditionNode, context);
  if (condition === undefined || body === undefined) return undefined;
  const fragments = [...semantic(`${otherwiseIf ? "Otherwise if" : "If"} ${condition}, then`, context), { kind: "pause", durationMs: context.options.linePauseMs } as const, ...blockFragments(body, context)];
  const elseIndex = parts.findIndex((part) => part.name === "else");
  if (elseIndex >= 0) {
    const alternate = parts[elseIndex + 1];
    if (alternate?.name === "IfStatement") appendSegment(fragments, ifFragments(alternate, context, true) ?? fallback(alternate, context), context.options.linePauseMs);
    else if (alternate?.name === "Block") {
      appendSegment(fragments, semantic("Otherwise", context), context.options.linePauseMs);
      appendSegment(fragments, blockFragments(alternate, context), context.options.linePauseMs);
    } else return undefined;
  }
  return fragments;
}

function statementFragments(node: SyntaxNode, context: Context): NarrationFragment[] {
  switch (node.name) {
    case "LineComment": return semantic(`Comment. ${text(node, context).replace(/^\s*\/\//u, "").trim()}`, context, true);
    case "BlockComment": return semantic(`Comment. ${text(node, context).replace(/^\s*\/\*/u, "").replace(/\*\/\s*$/u, "").trim()}`, context, true);
    case "ImportDeclaration": {
      const parts = children(node);
      const source = parts.find((part) => part.name === "String");
      const names = descendantsNamed(node, "VariableDefinition").map((part) => normalizeIdentifier(text(part, context)));
      if (source === undefined || names.length === 0) return fallback(node, context);
      return semantic(`Import ${joinNatural(names)} from ${text(source, context).slice(1, -1).replace("./", "dot slash ")}`, context);
    }
    case "VariableDeclaration": return variableDeclaration(node, context) ?? fallback(node, context);
    case "FunctionDeclaration": return functionFragments(node, context) ?? fallback(node, context);
    case "ExpressionStatement": {
      const valueNode = children(node).find((child) => child.name !== ";");
      if (valueNode?.name === "AssignmentExpression" || valueNode?.name === "PostfixExpression" || valueNode?.name === "UnaryExpression") {
        const value = updateExpression(valueNode, context);
        if (value !== undefined) return semantic(value, context);
      }
      const value = valueNode === undefined ? undefined : expression(valueNode, context);
      return value === undefined ? fallback(node, context) : semantic(value[0]?.toUpperCase() + value.slice(1), context);
    }
    case "ReturnStatement": {
      const valueNode = children(node).find((child) => child.name !== "return" && child.name !== ";");
      const value = valueNode === undefined ? undefined : expression(valueNode, context);
      return valueNode !== undefined && value === undefined ? fallback(node, context) : semantic(`Return${value === undefined ? "" : ` ${value}`}`, context);
    }
    case "WhileStatement": {
      const parts = children(node);
      const conditionNode = parts.find((part) => part.name === "ParenthesizedExpression");
      const body = parts.find((part) => part.name === "Block");
      const condition = conditionNode === undefined ? undefined : expression(conditionNode, context);
      if (condition === undefined || body === undefined) return fallback(node, context);
      const nested = blockFragments(body, context);
      return [...semantic(`While ${condition}`, context), ...(nested.length === 0 ? [] : [{ kind: "pause", durationMs: context.options.linePauseMs } as const, ...nested])];
    }
    case "ForStatement": {
      const parts = children(node);
      const spec = parts.find((part) => part.name === "ForOfSpec");
      const body = parts.find((part) => part.name === "Block");
      if (spec !== undefined && body !== undefined) {
        const specParts = children(spec);
        const item = specParts.find((part) => part.name === "VariableDefinition");
        const ofIndex = specParts.findIndex((part) => part.name === "of");
        const iterable = ofIndex < 0 ? undefined : expression(specParts[ofIndex + 1]!, context);
        if (item === undefined || iterable === undefined) return fallback(node, context);
        const nested = blockFragments(body, context);
        return [...semantic(`For each ${normalizeIdentifier(text(item, context))} of ${iterable}`, context), ...(nested.length === 0 ? [] : [{ kind: "pause", durationMs: context.options.linePauseMs } as const, ...nested])];
      }
      const cStyleSpec = parts.find((part) => part.name === "ForSpec");
      if (cStyleSpec === undefined || body === undefined) return fallback(node, context);
      const specParts = children(cStyleSpec).filter((part) => !["(", ")", ";"].includes(part.name));
      const initializer = specParts[0];
      const conditionNode = specParts[1];
      const updateNode = specParts[2];
      const initializerFragments = initializer?.name === "VariableDeclaration"
        ? variableDeclaration(initializer, context)
        : undefined;
      const condition = conditionNode === undefined ? undefined : expression(conditionNode, context);
      const update = updateNode === undefined ? undefined : updateExpression(updateNode, context);
      if (initializerFragments === undefined || condition === undefined || update === undefined || specParts.length !== 3) {
        return fallback(node, context);
      }
      const fragments: NarrationFragment[] = semantic("For loop", context);
      appendSegment(fragments, initializerFragments, context.options.linePauseMs);
      appendSegment(fragments, semantic(`Continue while ${condition}`, context), context.options.linePauseMs);
      appendSegment(fragments, semantic(`After each iteration, ${update[0]?.toLowerCase()}${update.slice(1)}`, context), context.options.linePauseMs);
      appendSegment(fragments, blockFragments(body, context), context.options.linePauseMs);
      return fragments;
    }
    case "IfStatement": return ifFragments(node, context) ?? fallback(node, context);
    default: return fallback(node, context);
  }
}

export function narrateTypeScript(source: string, tree: Tree, options: TypeScriptNarrationOptions): TypeScriptNarrationResult {
  const context: Context = { source, options, usedLiteralFallback: false };
  const fragments: NarrationFragment[] = [];
  for (const node of children(tree.topNode)) appendSegment(fragments, statementFragments(node, context), options.linePauseMs);
  return { fragments, usedLiteralFallback: context.usedLiteralFallback };
}
