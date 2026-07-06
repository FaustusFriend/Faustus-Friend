// Safe arithmetic formula evaluator for Grid cells. No eval()/Function() —
// a small hand-rolled tokenizer + recursive-descent parser supporting only
// numbers, + - * /, parentheses, and whitespace. Anything else (letters,
// cell references, function calls) fails to tokenize and is rejected.

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

const NUMBER_PATTERN = /^\d+(\.\d+)?$/;

function tokenize(expr: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const numStr = expr.slice(i, j);
      if (!NUMBER_PATTERN.test(numStr)) return null;
      tokens.push(numStr);
      i = j;
      continue;
    }
    return null;
  }
  return tokens;
}

class ParseError extends Error {}

class Parser {
  private pos = 0;
  constructor(private tokens: string[]) {}

  private peek(): string | undefined {
    return this.tokens[this.pos];
  }

  private next(): string {
    return this.tokens[this.pos++];
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.pos !== this.tokens.length) {
      throw new ParseError("Unexpected trailing input");
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.next();
      const rhs = this.parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.next();
      const rhs = this.parseUnary();
      if (op === "/") {
        if (rhs === 0) throw new ParseError("Division by zero");
        value = value / rhs;
      } else {
        value = value * rhs;
      }
    }
    return value;
  }

  private parseUnary(): number {
    if (this.peek() === "-") {
      this.next();
      return -this.parseUnary();
    }
    if (this.peek() === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.peek();
    if (token === "(") {
      this.next();
      const value = this.parseExpression();
      if (this.peek() !== ")") {
        throw new ParseError("Missing closing parenthesis");
      }
      this.next();
      return value;
    }
    if (token !== undefined && NUMBER_PATTERN.test(token)) {
      this.next();
      return parseFloat(token);
    }
    throw new ParseError("Unexpected token");
  }
}

/** Returns true if the cell text should be treated as a formula. */
export function isFormula(text: string): boolean {
  return text.trimStart().startsWith("=");
}

/**
 * Evaluates a formula string (including the leading `=`). Only numbers,
 * +, -, *, /, parentheses, and whitespace are supported — no cell
 * references, ranges, or named functions.
 */
export function evaluateFormula(text: string): FormulaResult {
  if (!isFormula(text)) {
    return { ok: false, error: "Not a formula" };
  }
  const expr = text.slice(text.indexOf("=") + 1);
  if (expr.trim().length === 0) {
    return { ok: false, error: "Empty formula" };
  }

  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) {
    return { ok: false, error: "Unsupported characters in formula" };
  }

  try {
    const value = new Parser(tokens).parse();
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Result is not a finite number" };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid formula" };
  }
}

/** Formats a numeric result for display, avoiding floating-point noise. */
export function formatFormulaValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}

/**
 * Computes the display text for a cell: the formatted formula result when
 * valid, or the raw text otherwise (plain text/number, or an invalid
 * formula preserved verbatim so it can be fixed).
 */
export function computeCellDisplay(text: string): { display: string; isError: boolean } {
  if (!isFormula(text)) {
    return { display: text, isError: false };
  }
  const result = evaluateFormula(text);
  if (result.ok) {
    return { display: formatFormulaValue(result.value), isError: false };
  }
  return { display: text, isError: true };
}
