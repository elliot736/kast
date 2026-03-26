import { describe, it, expect } from 'vitest';
import { evaluateExpression } from './expression-evaluator';

describe('evaluateExpression', () => {
  const context = {
    fetch_data: { status: 200, body: { name: 'Alice', count: 5, ready: true } },
    check: { body: { state: 'pending', items: [1, 2, 3] } },
    empty_step: {},
  };

  // ── Equality ──────────────────────────────────────────────
  describe('equality', () => {
    it('compares numbers', () => {
      expect(evaluateExpression('steps.fetch_data.status == 200', context)).toBe(true);
      expect(evaluateExpression('steps.fetch_data.status == 404', context)).toBe(false);
    });

    it('compares strings', () => {
      expect(evaluateExpression("steps.check.body.state == 'pending'", context)).toBe(true);
      expect(evaluateExpression('steps.check.body.state == "pending"', context)).toBe(true);
      expect(evaluateExpression("steps.check.body.state == 'ready'", context)).toBe(false);
    });

    it('compares booleans', () => {
      expect(evaluateExpression('steps.fetch_data.body.ready == true', context)).toBe(true);
      expect(evaluateExpression('steps.fetch_data.body.ready == false', context)).toBe(false);
    });

    it('supports != operator', () => {
      expect(evaluateExpression('steps.fetch_data.status != 404', context)).toBe(true);
      expect(evaluateExpression('steps.fetch_data.status != 200', context)).toBe(false);
    });
  });

  // ── Numeric comparisons ───────────────────────────────────
  describe('numeric comparisons', () => {
    it('supports > and <', () => {
      expect(evaluateExpression('steps.fetch_data.body.count > 3', context)).toBe(true);
      expect(evaluateExpression('steps.fetch_data.body.count < 3', context)).toBe(false);
    });

    it('supports >= and <=', () => {
      expect(evaluateExpression('steps.fetch_data.body.count >= 5', context)).toBe(true);
      expect(evaluateExpression('steps.fetch_data.body.count <= 5', context)).toBe(true);
      expect(evaluateExpression('steps.fetch_data.body.count >= 6', context)).toBe(false);
    });
  });

  // ── Logical operators ─────────────────────────────────────
  describe('logical operators', () => {
    it('supports &&', () => {
      expect(evaluateExpression(
        'steps.fetch_data.status == 200 && steps.fetch_data.body.ready == true',
        context,
      )).toBe(true);
      expect(evaluateExpression(
        'steps.fetch_data.status == 200 && steps.fetch_data.body.ready == false',
        context,
      )).toBe(false);
    });

    it('supports ||', () => {
      expect(evaluateExpression(
        'steps.fetch_data.status == 404 || steps.fetch_data.body.ready == true',
        context,
      )).toBe(true);
    });

    it('supports !', () => {
      expect(evaluateExpression('!(steps.fetch_data.status == 404)', context)).toBe(true);
      expect(evaluateExpression('!(steps.fetch_data.status == 200)', context)).toBe(false);
    });
  });

  // ── Parentheses ───────────────────────────────────────────
  it('respects parentheses grouping', () => {
    expect(evaluateExpression(
      '(steps.fetch_data.status == 200 || steps.fetch_data.status == 201) && steps.fetch_data.body.ready == true',
      context,
    )).toBe(true);
  });

  // ── Missing paths ─────────────────────────────────────────
  describe('missing paths', () => {
    it('returns false for comparisons against undefined', () => {
      expect(evaluateExpression('steps.nonexistent.field == 200', context)).toBe(false);
    });

    it('returns false for deep missing paths', () => {
      expect(evaluateExpression('steps.fetch_data.body.missing.deep == true', context)).toBe(false);
    });

    it('can compare to null', () => {
      expect(evaluateExpression('steps.nonexistent.field == null', context)).toBe(false);
      // undefined !== null in strict comparison
    });
  });

  // ── Security ──────────────────────────────────────────────
  describe('security', () => {
    it('blocks __proto__ access', () => {
      expect(evaluateExpression('steps.__proto__.constructor == true', context)).toBe(false);
    });

    it('blocks constructor access', () => {
      expect(evaluateExpression('steps.constructor == true', context)).toBe(false);
    });
  });

  // ── Syntax errors ─────────────────────────────────────────
  describe('syntax errors', () => {
    it('throws on invalid syntax', () => {
      expect(() => evaluateExpression('steps.a ==', context)).toThrow();
    });

    it('throws on unterminated string', () => {
      expect(() => evaluateExpression("steps.a == 'unterminated", context)).toThrow();
    });

    it('throws on unexpected character', () => {
      expect(() => evaluateExpression('steps.a @ 5', context)).toThrow();
    });
  });

  // ── Non-"steps" root ──────────────────────────────────────
  it('resolves non-steps root from context directly', () => {
    const ctx = { myVar: { val: 42 } };
    expect(evaluateExpression('myVar.val == 42', ctx)).toBe(true);
  });
});
