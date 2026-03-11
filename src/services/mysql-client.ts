import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, FieldPacket, RowDataPacket } from 'mysql2/promise';
import type { LocalSiteConfig } from '../types.js';
import { getMysqlSocketPath } from './local-detector.js';

let pool: Pool | null = null;
let currentSiteId: string | null = null;

export const READ_ONLY_PATTERN = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\s/i;
export const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|RENAME|OPTIMIZE|REPAIR)\s/i;

// Dangerous clauses that can appear inside otherwise read-only queries.
// INTO OUTFILE/DUMPFILE can write files to disk; LOAD_FILE reads arbitrary files.
const DANGEROUS_CLAUSE_PATTERN = /\b(INTO\s+(OUTFILE|DUMPFILE)|LOAD_FILE\s*\()/i;

export function classifyQuery(query: string, allowWrites: boolean): { allowed: boolean; reason?: string } {
  if (WRITE_PATTERN.test(query) && !allowWrites) {
    return {
      allowed: false,
      reason: 'Write queries are disabled. Set MYSQL_ALLOW_WRITES=true to enable INSERT/UPDATE/DELETE operations.',
    };
  }

  if (!READ_ONLY_PATTERN.test(query) && !WRITE_PATTERN.test(query)) {
    return {
      allowed: false,
      reason: `Unrecognized query type. Supported read queries: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH (CTEs). Write queries (when enabled): INSERT, UPDATE, DELETE, REPLACE, ALTER, CREATE, DROP, TRUNCATE, RENAME, OPTIMIZE, REPAIR.`,
    };
  }

  // Block dangerous clauses even in read-only queries
  if (DANGEROUS_CLAUSE_PATTERN.test(query)) {
    return {
      allowed: false,
      reason: 'Query contains a blocked clause (INTO OUTFILE, INTO DUMPFILE, or LOAD_FILE). These can read/write arbitrary files and are not allowed.',
    };
  }

  return { allowed: true };
}

export function createPool(site: LocalSiteConfig): Pool {
  if (pool && currentSiteId === site.id) {
    return pool;
  }

  // Close existing pool if switching sites
  if (pool) {
    pool.end().catch(() => {});
  }

  const socketPath = getMysqlSocketPath(site);

  pool = mysql.createPool({
    socketPath,
    user: site.mysql.user || 'root',
    password: site.mysql.password || 'root',
    database: site.mysql.database || 'local',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10_000,
    multipleStatements: false,
  });

  currentSiteId = site.id;
  return pool;
}

export async function executeQuery(
  site: LocalSiteConfig,
  query: string,
): Promise<{ rows: unknown[]; fields: string[]; rowCount: number }> {
  const allowWrites = process.env.MYSQL_ALLOW_WRITES === 'true';

  const check = classifyQuery(query, allowWrites);
  if (!check.allowed) {
    throw new Error(check.reason);
  }

  const p = createPool(site);
  let conn: PoolConnection | null = null;

  try {
    conn = await p.getConnection();
    const [rows, fields] = await conn.query<RowDataPacket[]>(query);
    const resultRows = Array.isArray(rows) ? rows : [rows];
    const fieldNames = Array.isArray(fields)
      ? (fields as FieldPacket[]).map((f) => f.name)
      : [];

    return {
      rows: resultRows as unknown[],
      fields: fieldNames,
      rowCount: resultRows.length,
    };
  } catch (err) {
    // Invalidate pool on connection errors so next call creates a fresh pool
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'PROTOCOL_CONNECTION_LOST') {
      pool = null;
      currentSiteId = null;
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

export async function getSchema(
  site: LocalSiteConfig,
  tableName?: string,
): Promise<{ tables: Array<{ name: string; columns?: Array<{ name: string; type: string; nullable: string; key: string; default: unknown }> }> }> {
  const p = createPool(site);
  let conn: PoolConnection | null = null;

  try {
    conn = await p.getConnection();

    if (tableName) {
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [site.mysql.database || 'local', tableName]
      );

      return {
        tables: [{
          name: tableName,
          columns: (cols as RowDataPacket[]).map((c) => ({
            name: c.COLUMN_NAME as string,
            type: c.COLUMN_TYPE as string,
            nullable: c.IS_NULLABLE as string,
            key: c.COLUMN_KEY as string,
            default: c.COLUMN_DEFAULT as unknown,
          })),
        }],
      };
    }

    const [tables] = await conn.query(
      `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME`,
      [site.mysql.database || 'local']
    );

    return {
      tables: (tables as RowDataPacket[]).map((t) => ({
        name: t.TABLE_NAME as string,
      })),
    };
  } finally {
    if (conn) conn.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    currentSiteId = null;
  }
}
