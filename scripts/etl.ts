import sql from "../src/lib/db";
import { parse } from "csv-parse/sync";
import { createReadStream } from "fs";
import { readdir, stat, mkdir, rm } from "fs/promises";
import { join } from "path";
import * as readline from "readline";
import { refreshViews, recordSync } from "./refresh-views";

const SOURCE_DIR = process.env.ETL_SOURCE_DIR ?? "data/source";
const INCOMING_DIR = process.env.ETL_INCOMING_DIR ?? "data/incoming";
const DAYS_BACK = Number(process.env.ETL_DAYS_BACK ?? "7");
const BATCH_LINES = Number(process.env.ETL_BATCH_LINES ?? "5000");
const IMPORTED_AT = new Date().toISOString();

// Edit these if the CSV headers differ from the database column names.
const COLUMN_MAPPING: Record<string, string> = {
  // "CSV Header": "db_column",
};

type TableConfig = {
  file: string;
  table: string;
  keyColumns: string[];
  sourcePattern?: string;
};

const CONFIG: TableConfig[] = [
  {
    file: "vulnerabilities.csv",
    table: "vulnerabilities",
    keyColumns: ["QG_HostID", "QID", "Port"],
    sourcePattern: "vulnerabilities*.csv",
  },
  {
    file: "All_Assets.csv",
    table: "All_Assets",
    keyColumns: ["QG_HostID"],
    sourcePattern: "All_Assets*.csv",
  },
  {
    file: "KnowledgeBase.csv",
    table: "KnowledgeBase",
    keyColumns: ["QID"],
    sourcePattern: "KnowledgeBase*.csv",
  },
  {
    file: "kb_summary.csv",
    table: "kb_summary",
    keyColumns: ["qid"],
    sourcePattern: "kb_summary*.csv",
  },
];

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`, "i");
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function clearIncoming() {
  await ensureDir(INCOMING_DIR);
  const entries = await readdir(INCOMING_DIR);
  for (const entry of entries) {
    await rm(join(INCOMING_DIR, entry), { recursive: true, force: true });
  }
}

async function collectCsvs() {
  await ensureDir(SOURCE_DIR);
  await clearIncoming();

  const cutoff = Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000;
  const allFiles = await readdir(SOURCE_DIR);

  for (const cfg of CONFIG) {
    const pattern = cfg.sourcePattern ?? cfg.file;
    const regex = globToRegex(pattern);

    const candidates: { path: string; mtime: number }[] = [];
    for (const name of allFiles) {
      if (!regex.test(name)) continue;
      const filePath = join(SOURCE_DIR, name);
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      if (info.mtimeMs < cutoff) continue;
      candidates.push({ path: filePath, mtime: info.mtimeMs });
    }

    if (candidates.length === 0) {
      console.log(`[COLLECT] no recent file for ${cfg.table} (pattern: ${pattern})`);
      continue;
    }

    candidates.sort((a, b) => b.mtime - a.mtime);
    const chosen = candidates[0];
    const dest = join(INCOMING_DIR, cfg.file);
    await Bun.write(dest, Bun.file(chosen.path));
    console.log(
      `[COLLECT] ${cfg.table}: ${chosen.path} -> ${cfg.file} (${new Date(chosen.mtime).toISOString()})`,
    );
  }
}

async function getTableColumns(table: string): Promise<string[]> {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  return rows.map((r) => r.column_name as string);
}

function quoteId(id: string) {
  return `"${id.replace(/"/g, '""')}"`;
}

function stagingName(table: string) {
  return `etl_staging_${table}`;
}

async function ensureStagingTable(table: string) {
  const staging = stagingName(table);
  await sql.unsafe(
    `CREATE UNLOGGED TABLE IF NOT EXISTS ${quoteId(staging)} AS TABLE ${quoteId(table)} WITH NO DATA`,
  );
}

async function truncateStaging(table: string) {
  await sql.unsafe(`TRUNCATE ${quoteId(stagingName(table))}`);
}

function mapRow(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [csvCol, value] of Object.entries(row)) {
    const cleanKey = csvCol.replace(/^\uFEFF/, "");
    const dbCol = COLUMN_MAPPING[cleanKey] ?? cleanKey;
    mapped[dbCol] = value;
  }
  return mapped;
}

function buildInsertSql(table: string, columns: string[], rows: Record<string, string | null>[]) {
  const placeholders = rows
    .map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`)
    .join(", ");
  const values = rows.flatMap((r) => columns.map((c) => r[c] ?? null));
  return {
    sql: `INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(", ")}) VALUES ${placeholders}`,
    values,
  };
}

async function loadCsvIntoStaging(filePath: string, table: string, allowedColumns: string[]) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string | null = null;
  let buffer: string[] = [];
  let inserted = 0;

  for await (const rawLine of rl) {
    const line = header === null ? rawLine.replace(/^\uFEFF/, "") : rawLine;
    if (header === null) {
      header = line;
      continue;
    }
    buffer.push(line);
    if (buffer.length >= BATCH_LINES) {
      inserted += await insertChunk(header, buffer, table, allowedColumns);
      buffer = [];
    }
  }

  if (header && buffer.length > 0) {
    inserted += await insertChunk(header, buffer, table, allowedColumns);
  }

  return inserted;
}

async function insertChunk(
  header: string,
  lines: string[],
  table: string,
  allowedColumns: string[],
) {
  const csvText = [header, ...lines].join("\n");
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const rows = records.map((r) => {
    const mapped = mapRow(r);
    const row: Record<string, string | null> = {};
    for (const col of allowedColumns) {
      if (col === "imported_at") {
        row[col] = IMPORTED_AT;
        continue;
      }
      const value = mapped[col];
      row[col] = value && value.trim() !== "" ? value : null;
    }
    return row;
  });

  if (rows.length === 0) return 0;
  const { sql: insertSql, values } = buildInsertSql(stagingName(table), allowedColumns, rows);
  await sql.unsafe(insertSql, values);
  return rows.length;
}

async function deduplicateStaging(table: string, keyColumns: string[]) {
  const staging = stagingName(table);
  const keyMatch = keyColumns.map((c) => `a.${quoteId(c)} = b.${quoteId(c)}`).join(" AND ");
  await sql.unsafe(
    `DELETE FROM ${quoteId(staging)} a USING ${quoteId(staging)} b WHERE a.ctid < b.ctid AND ${keyMatch}`,
  );
}

async function applyDelta(table: string, keyColumns: string[]) {
  const staging = stagingName(table);
  const keyList = keyColumns.map(quoteId).join(", ");
  await sql.begin(async (tx) => {
    await tx.unsafe(
      `DELETE FROM ${quoteId(table)} WHERE (${keyList}) IN (SELECT DISTINCT ${keyList} FROM ${quoteId(staging)})`,
    );
    await tx.unsafe(`INSERT INTO ${quoteId(table)} SELECT * FROM ${quoteId(staging)}`);
  });
}

async function loadTable(cfg: TableConfig) {
  const filePath = `${INCOMING_DIR}/${cfg.file}`;
  const exists = await Bun.file(filePath).exists();
  if (!exists) {
    console.log(`[SKIP] ${cfg.file} not found`);
    return;
  }

  console.log(`[LOAD] ${cfg.file} -> ${cfg.table}`);
  const allowedColumns = await getTableColumns(cfg.table);
  await ensureStagingTable(cfg.table);
  await truncateStaging(cfg.table);

  const inserted = await loadCsvIntoStaging(filePath, cfg.table, allowedColumns);
  console.log(`[LOADED] ${inserted} staging rows`);

  await deduplicateStaging(cfg.table, cfg.keyColumns);
  const [{ count }] = await sql.unsafe(
    `SELECT COUNT(*)::int as count FROM ${quoteId(stagingName(cfg.table))}`,
  );
  console.log(`[DEDUP] ${count} unique rows`);

  await applyDelta(cfg.table, cfg.keyColumns);
  console.log(`[DELTA] applied`);
}

async function main() {
  console.log(
    `ETL starting — source: ${SOURCE_DIR}, incoming: ${INCOMING_DIR}, days_back: ${DAYS_BACK}`,
  );
  await collectCsvs();
  for (const cfg of CONFIG) {
    await loadTable(cfg);
  }
  console.log("Refreshing materialized views...");
  await refreshViews();
  await recordSync();
  console.log("ETL complete.");
  process.exit(0);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("ETL failed:", e);
    process.exit(1);
  });
}
