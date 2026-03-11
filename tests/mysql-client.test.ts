import { describe, it, expect } from 'vitest';
import { classifyQuery, READ_ONLY_PATTERN, WRITE_PATTERN } from '../src/services/mysql-client.js';

// ── READ_ONLY_PATTERN ─────────────────────────────────────────────

describe('READ_ONLY_PATTERN', () => {
  const readQueries = [
    'SELECT * FROM wp_options',
    'select * from wp_options',
    'SELECT COUNT(*) FROM wp_posts',
    'SHOW TABLES',
    'show tables',
    'SHOW CREATE TABLE wp_options',
    'DESCRIBE wp_options',
    'describe wp_options',
    'DESC wp_posts',
    'EXPLAIN SELECT * FROM wp_posts',
    'explain select * from wp_posts',
    'WITH cte AS (SELECT 1) SELECT * FROM cte',
    'with cte as (select * from wp_posts) select * from cte',
    '  SELECT * FROM wp_options',   // leading whitespace
    '\tSELECT * FROM wp_options',   // leading tab
    '\nSELECT * FROM wp_options',   // leading newline
  ];

  for (const q of readQueries) {
    it(`matches read-only query: ${q.slice(0, 50)}...`, () => {
      expect(READ_ONLY_PATTERN.test(q)).toBe(true);
    });
  }

  const nonReadQueries = [
    'INSERT INTO wp_options VALUES (1, 2)',
    'UPDATE wp_options SET option_value = "x"',
    'DELETE FROM wp_options WHERE option_id = 1',
    'DROP TABLE wp_options',
    'ALTER TABLE wp_options ADD COLUMN x INT',
    'CREATE TABLE test (id INT)',
    'SET @var = 1',
    'CALL my_procedure()',
    'GRANT ALL ON *.* TO root',
    'USE wordpress',
    'LOCK TABLES wp_options',
  ];

  for (const q of nonReadQueries) {
    it(`does not match non-read query: ${q.slice(0, 50)}...`, () => {
      expect(READ_ONLY_PATTERN.test(q)).toBe(false);
    });
  }
});

// ── WRITE_PATTERN ─────────────────────────────────────────────────

describe('WRITE_PATTERN', () => {
  const writeQueries = [
    'INSERT INTO wp_options (option_name) VALUES ("test")',
    'insert into wp_options values (1)',
    'UPDATE wp_options SET option_value = "new"',
    'update wp_options set option_value = "new"',
    'DELETE FROM wp_options WHERE option_id = 1',
    'delete from wp_options where option_id = 1',
    'REPLACE INTO wp_options VALUES (1, "x", "y")',
    'ALTER TABLE wp_options ADD COLUMN x INT',
    'CREATE TABLE test (id INT)',
    'DROP TABLE test',
    'TRUNCATE TABLE wp_options',
    'RENAME TABLE wp_options TO wp_options_old',
    'OPTIMIZE TABLE wp_options',
    'REPAIR TABLE wp_options',
    '  INSERT INTO wp_options VALUES (1)',   // leading whitespace
  ];

  for (const q of writeQueries) {
    it(`matches write query: ${q.slice(0, 50)}...`, () => {
      expect(WRITE_PATTERN.test(q)).toBe(true);
    });
  }

  const nonWriteQueries = [
    'SELECT * FROM wp_options',
    'SHOW TABLES',
    'DESCRIBE wp_options',
    'SET @var = 1',
    'GRANT ALL ON *.*',
    'USE wordpress',
  ];

  for (const q of nonWriteQueries) {
    it(`does not match non-write query: ${q.slice(0, 50)}...`, () => {
      expect(WRITE_PATTERN.test(q)).toBe(false);
    });
  }
});

// ── classifyQuery ─────────────────────────────────────────────────

describe('classifyQuery', () => {
  // Read queries always allowed
  it('allows SELECT when writes disabled', () => {
    expect(classifyQuery('SELECT * FROM wp_options', false)).toEqual({ allowed: true });
  });

  it('allows SHOW when writes disabled', () => {
    expect(classifyQuery('SHOW TABLES', false)).toEqual({ allowed: true });
  });

  it('allows DESCRIBE when writes disabled', () => {
    expect(classifyQuery('DESCRIBE wp_options', false)).toEqual({ allowed: true });
  });

  it('allows EXPLAIN when writes disabled', () => {
    expect(classifyQuery('EXPLAIN SELECT * FROM wp_posts', false)).toEqual({ allowed: true });
  });

  it('allows WITH (CTEs) when writes disabled', () => {
    expect(classifyQuery('WITH cte AS (SELECT 1) SELECT * FROM cte', false)).toEqual({ allowed: true });
  });

  // Write queries blocked when writes disabled
  it('blocks INSERT when writes disabled', () => {
    const result = classifyQuery('INSERT INTO wp_options VALUES (1)', false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('MYSQL_ALLOW_WRITES');
  });

  it('blocks UPDATE when writes disabled', () => {
    const result = classifyQuery('UPDATE wp_options SET option_value = "x"', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks DELETE when writes disabled', () => {
    const result = classifyQuery('DELETE FROM wp_options WHERE option_id = 1', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks DROP when writes disabled', () => {
    const result = classifyQuery('DROP TABLE test', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks TRUNCATE when writes disabled', () => {
    const result = classifyQuery('TRUNCATE TABLE wp_options', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks OPTIMIZE when writes disabled', () => {
    const result = classifyQuery('OPTIMIZE TABLE wp_options', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks REPAIR when writes disabled', () => {
    const result = classifyQuery('REPAIR TABLE wp_options', false);
    expect(result.allowed).toBe(false);
  });

  // Write queries allowed when writes enabled
  it('allows INSERT when writes enabled', () => {
    expect(classifyQuery('INSERT INTO wp_options VALUES (1)', true)).toEqual({ allowed: true });
  });

  it('allows UPDATE when writes enabled', () => {
    expect(classifyQuery('UPDATE wp_options SET option_value = "x"', true)).toEqual({ allowed: true });
  });

  it('allows DELETE when writes enabled', () => {
    expect(classifyQuery('DELETE FROM wp_options WHERE option_id = 1', true)).toEqual({ allowed: true });
  });

  it('allows DROP when writes enabled', () => {
    expect(classifyQuery('DROP TABLE test', true)).toEqual({ allowed: true });
  });

  // Unrecognized queries always blocked
  it('rejects SET as unrecognized', () => {
    const result = classifyQuery('SET @var = 1', false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unrecognized');
  });

  it('rejects SET even when writes enabled', () => {
    const result = classifyQuery('SET @var = 1', true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unrecognized');
  });

  it('rejects GRANT as unrecognized', () => {
    const result = classifyQuery('GRANT ALL ON *.* TO root', false);
    expect(result.allowed).toBe(false);
  });

  it('rejects USE as unrecognized', () => {
    const result = classifyQuery('USE wordpress', false);
    expect(result.allowed).toBe(false);
  });

  it('rejects CALL as unrecognized', () => {
    const result = classifyQuery('CALL my_procedure()', false);
    expect(result.allowed).toBe(false);
  });

  it('rejects LOCK as unrecognized', () => {
    const result = classifyQuery('LOCK TABLES wp_options', false);
    expect(result.allowed).toBe(false);
  });

  it('rejects empty query', () => {
    const result = classifyQuery('', false);
    expect(result.allowed).toBe(false);
  });

  it('rejects random text', () => {
    const result = classifyQuery('hello world', false);
    expect(result.allowed).toBe(false);
  });
});
