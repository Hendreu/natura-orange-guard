import sql from "../src/lib/db";

const views = [
  "mv_overview",
  "mv_chart_sev",
  "mv_sla",
  "mv_raw",
  "mv_top_qids",
  "mv_top_assets",
  "mv_team_overview",
  "mv_team_chart_sev",
  "mv_team_sla",
  "mv_team_raw",
  "mv_hardening_summary",
  "mv_hardening_categories",
  "mv_hardening_topqids",
  "mv_report_summary",
  "mv_report_os",
  "mv_report_topqids",
  "mv_report_categories",
  "mv_report_assets",
  "mv_report_teamrows",
];

export async function recordSync() {
  const viewsCount = views.length;
  await sql`
    CREATE TABLE IF NOT EXISTS sync_status (
      id integer PRIMARY KEY,
      last_refresh timestamp NOT NULL,
      views_count integer NOT NULL
    )
  `;
  await sql`GRANT SELECT ON sync_status TO PUBLIC`;
  await sql`
    INSERT INTO sync_status (id, last_refresh, views_count)
    VALUES (1, NOW(), ${viewsCount})
    ON CONFLICT (id) DO UPDATE SET
      last_refresh = EXCLUDED.last_refresh,
      views_count = EXCLUDED.views_count
  `;
}

export async function refreshViews() {
  for (const view of views) {
    const start = Date.now();
    await sql.unsafe(`REFRESH MATERIALIZED VIEW ${view}`);
    console.log(`[OK] ${view} — ${Date.now() - start}ms`);
  }
}

async function main() {
  console.log("Refreshing views...");
  await refreshViews();
  await recordSync();
  console.log("Done.");
  process.exit(0);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Refresh failed:", e);
    process.exit(1);
  });
}
