import { describe, it, expect } from 'vitest';
import { isCommandAllowed, validateArgs } from '../src/services/wp-cli.js';

/**
 * Tests for WP-CLI format/argument handling.
 *
 * These tests verify command allowlisting and argument validation
 * without requiring a running Local instance.
 */

describe('WP-CLI format handling', () => {
  it('write commands are rejected when writes disabled (regardless of format)', () => {
    const result = isCommandAllowed('post meta update 42 _key value', false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('WPCLI_ALLOW_WRITES');
  });

  it('write commands are allowed when writes enabled', () => {
    const result = isCommandAllowed('post meta update 42 _key value', true);
    expect(result).toEqual({ allowed: true });
  });

  it('read commands are allowed without writes', () => {
    expect(isCommandAllowed('post meta list 42', false)).toEqual({ allowed: true });
  });
});

describe('WP-CLI argument validation with format', () => {
  it('allows format flags in args', () => {
    expect(validateArgs(['--format=json'])).toEqual({ valid: true });
    expect(validateArgs(['--format=table'])).toEqual({ valid: true });
  });

  it('allows normal positional args', () => {
    expect(validateArgs(['42', 'test-value'])).toEqual({ valid: true });
  });

  it('rejects dangerous --require flag even alongside format', () => {
    const result = validateArgs(['--format=json', '--require=/tmp/evil.php']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('--require');
  });
});
