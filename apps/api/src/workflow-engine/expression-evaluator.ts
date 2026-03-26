// ── Token types ─────────────────────────────────────────────

type TokenType =
  | 'number' | 'string' | 'boolean' | 'null' | 'identifier' | 'dot'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'and' | 'or' | 'not'
  | 'lparen' | 'rparen' | 'eof';

interface Token { type: TokenType; value: string | number | boolean | null; }

// ── Tokenizer ───────────────────────────────────────────────

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) { i++; continue; }

    // Two-char operators
    if (i + 1 < input.length) {
      const two = input.slice(i, i + 2);
      if (two === '==') { tokens.push({ type: 'eq', value: '==' }); i += 2; continue; }
      if (two === '!=') { tokens.push({ type: 'neq', value: '!=' }); i += 2; continue; }
      if (two === '>=') { tokens.push({ type: 'gte', value: '>=' }); i += 2; continue; }
      if (two === '<=') { tokens.push({ type: 'lte', value: '<=' }); i += 2; continue; }
      if (two === '&&') { tokens.push({ type: 'and', value: '&&' }); i += 2; continue; }
      if (two === '||') { tokens.push({ type: 'or', value: '||' }); i += 2; continue; }
    }

    // Single-char operators
    if (ch === '>') { tokens.push({ type: 'gt', value: '>' }); i++; continue; }
    if (ch === '<') { tokens.push({ type: 'lt', value: '<' }); i++; continue; }
    if (ch === '!') { tokens.push({ type: 'not', value: '!' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (ch === '.') { tokens.push({ type: 'dot', value: '.' }); i++; continue; }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '-' && i + 1 < input.length && /[0-9]/.test(input[i + 1]))) {
      let num = '';
      if (ch === '-') { num = '-'; i++; }
      while (i < input.length && /[0-9.]/.test(input[i])) { num += input[i]; i++; }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) { str += input[i + 1]; i += 2; }
        else { str += input[i]; i++; }
      }
      if (i >= input.length) throw new Error(`Unterminated string in expression`);
      i++; // skip closing quote
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) { ident += input[i]; i++; }
      if (ident === 'true') { tokens.push({ type: 'boolean', value: true }); }
      else if (ident === 'false') { tokens.push({ type: 'boolean', value: false }); }
      else if (ident === 'null') { tokens.push({ type: 'null', value: null }); }
      else { tokens.push({ type: 'identifier', value: ident }); }
      continue;
    }

    throw new Error(`Unexpected character '${ch}' in expression at position ${i}`);
  }

  tokens.push({ type: 'eof', value: null });
  return tokens;
}

// ── AST nodes ───────────────────────────────────────────────

type ASTNode =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'path'; segments: string[] }
  | { kind: 'unary'; op: '!'; operand: ASTNode }
  | { kind: 'binary'; op: string; left: ASTNode; right: ASTNode };

// ── Parser (recursive descent) ──────────────────────────────

function parse(tokens: Token[]): ASTNode {
  let pos = 0;

  function peek(): Token { return tokens[pos]; }
  function advance(): Token { return tokens[pos++]; }
  function expect(type: TokenType): Token {
    const t = advance();
    if (t.type !== type) throw new Error(`Expected ${type} but got ${t.type}`);
    return t;
  }

  // or_expr = and_expr ( '||' and_expr )*
  function parseOr(): ASTNode {
    let left = parseAnd();
    while (peek().type === 'or') {
      advance();
      left = { kind: 'binary', op: '||', left, right: parseAnd() };
    }
    return left;
  }

  // and_expr = comparison ( '&&' comparison )*
  function parseAnd(): ASTNode {
    let left = parseComparison();
    while (peek().type === 'and') {
      advance();
      left = { kind: 'binary', op: '&&', left, right: parseComparison() };
    }
    return left;
  }

  // comparison = unary ( ('==' | '!=' | '>' | '<' | '>=' | '<=') unary )?
  function parseComparison(): ASTNode {
    let left = parseUnary();
    const t = peek();
    if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(t.type)) {
      const op = advance().value as string;
      return { kind: 'binary', op, left, right: parseUnary() };
    }
    return left;
  }

  // unary = '!' unary | primary
  function parseUnary(): ASTNode {
    if (peek().type === 'not') {
      advance();
      return { kind: 'unary', op: '!', operand: parseUnary() };
    }
    return parsePrimary();
  }

  // primary = literal | path | '(' or_expr ')'
  function parsePrimary(): ASTNode {
    const t = peek();

    if (t.type === 'lparen') {
      advance();
      const node = parseOr();
      expect('rparen');
      return node;
    }

    if (t.type === 'number' || t.type === 'string' || t.type === 'boolean' || t.type === 'null') {
      advance();
      return { kind: 'literal', value: t.value as string | number | boolean | null };
    }

    if (t.type === 'identifier') {
      const segments: string[] = [advance().value as string];
      while (peek().type === 'dot') {
        advance();
        const next = peek();
        if (next.type === 'identifier') {
          segments.push(advance().value as string);
        } else if (next.type === 'number') {
          // array index: steps.fan_out.branches.0.status
          segments.push(String(advance().value));
        } else {
          throw new Error(`Expected identifier after '.' but got ${next.type}`);
        }
      }
      return { kind: 'path', segments };
    }

    throw new Error(`Unexpected token '${t.value}' (${t.type}) in expression`);
  }

  const ast = parseOr();
  if (peek().type !== 'eof') {
    throw new Error(`Unexpected token '${peek().value}' after expression`);
  }
  return ast;
}

// ── Evaluator ───────────────────────────────────────────────

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function resolvePath(segments: string[], context: Record<string, unknown>): unknown {
  // The first segment "steps" is the context root alias
  let current: unknown = segments[0] === 'steps' ? context : context[segments[0]];
  const start = 1;

  for (let i = start; i < segments.length; i++) {
    if (current == null) return undefined;
    if (BLOCKED_KEYS.has(segments[i])) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segments[i]];
  }
  return current;
}

function evaluate(node: ASTNode, context: Record<string, unknown>): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'path':
      return resolvePath(node.segments, context);

    case 'unary':
      return !evaluate(node.operand, context);

    case 'binary': {
      if (node.op === '&&') return evaluate(node.left, context) && evaluate(node.right, context);
      if (node.op === '||') return evaluate(node.left, context) || evaluate(node.right, context);

      const left = evaluate(node.left, context);
      const right = evaluate(node.right, context);

      switch (node.op) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>':  return (left as number) > (right as number);
        case '>=': return (left as number) >= (right as number);
        case '<':  return (left as number) < (right as number);
        case '<=': return (left as number) <= (right as number);
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Evaluate a simple expression against workflow context.
 * Returns a boolean. Throws on syntax errors.
 */
export function evaluateExpression(
  expression: string,
  context: Record<string, unknown>,
): boolean {
  const tokens = tokenize(expression);
  const ast = parse(tokens);
  return !!evaluate(ast, context);
}
