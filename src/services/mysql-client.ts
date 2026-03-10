import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { LocalSiteConfig } from '../types.js';
import { getMysqlSocketPath } from './local-detector.js';

let pool: Pool | null = null;
let currentSiteId: string | null = null;

const READ_ONLY_PATTERN = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\s/i;
const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|RENAME)\s/i;

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
  });

  currentSiteId = site.id;
  return pool;
}

export async function executeQuery(
  site: LocalSiteConfig,
  query: string,
): Promise<{ rows: unknown[]; fields: string[]; rowCount: number }> {
  const allowWrites = process.env.MYSQL_ALLOW_WRITES === 'true';

  if (WRITE_PATTERN.test(query) && !allowWrites) {
    throw new Error(
      'Write queries are disabled. Set MYSQL_ALLOW_WRITES=true to enable INSERT/UPDATE/DELETE operations.'
    );
  }

  if (!READ_ONLY_PATTERN.test(query) && !WRITE_PATTERN.test(query)) {
    throw new Error(
      `Unrecognized query type. Only SELECT, SHOW, DESCRIBE, EXPLAIN, INSERT, UPDATE, DELETE are supported.`
    );
  }

  const p = createPool(site);
  let conn: PoolConnection | null = null;

  try {
    conn = await p.getConnection();
    const [rows, fields] = await conn.query(query);
    const resultRows = Array.isArray(rows) ? rows : [rows];
    const fieldNames = Array.isArray(fields)
      ? fields.map((f: any) => f.name)
      : [];

    return {
      rows: resultRows as unknown[],
      fields: fieldNames,
      rowCount: resultRows.length,
    };
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
          columns: (cols as any[]).map((c) => ({
            name: c.COLUMN_NAME,
            type: c.COLUMN_TYPE,
            nullable: c.IS_NULLABLE,
            key: c.COLUMN_KEY,
            default: c.COLUMN_DEFAULT,
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
      tables: (tables as any[]).map((t) => ({
        name: t.TABLE_NAME,
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
