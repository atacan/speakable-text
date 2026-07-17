export const DEFAULT_OPERATOR_PHRASES = Object.freeze({
  "===": "is strictly equal to",
  "!==": "is not strictly equal to",
  "==": "is equal to",
  "!=": "is not equal to",
  "<=": "is less than or equal to",
  ">=": "is greater than or equal to",
  "<": "is less than",
  ">": "is greater than",
  "&&": "and",
  "||": "or",
  "and": "and",
  "or": "or",
  "!": "not",
  "not": "not",
  "=": "set to",
  "+=": "increase by",
  "-=": "decrease by",
  "+": "plus",
  "-": "minus",
  "*": "multiplied by",
  "/": "divided by",
  "%": "modulo",
  "??": "otherwise use",
  "?.": "optionally access",
} as const);

export type CodeOperator = keyof typeof DEFAULT_OPERATOR_PHRASES;
export type OperatorPhrasebook = Readonly<Record<CodeOperator, string>>;

export const CODE_OPERATORS_LONGEST_FIRST: readonly CodeOperator[] = Object.freeze(
  (Object.keys(DEFAULT_OPERATOR_PHRASES) as CodeOperator[])
    .filter((operator) => !/^[A-Za-z]+$/u.test(operator))
    .sort((left, right) => right.length - left.length || (left < right ? -1 : 1)),
);
