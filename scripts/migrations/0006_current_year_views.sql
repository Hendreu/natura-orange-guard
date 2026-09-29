-- Current-year materialized views for fast default loading.
-- These filter vulnerabilities by Last_Found_Datetime >= Jan 1 of the current year.
-- Refresh them daily via the pipeline so date_trunc('year', now()) stays current.

DROP MATERIALIZED VIEW IF EXISTS "mv_sla_current_year";
CREATE MATERIALIZED VIEW "mv_sla_current_year" AS WITH base AS (
  SELECT
    CASE v."Severity"::integer
      WHEN 5 THEN 'Crítica'::text
      WHEN 4 THEN 'Alta'::text
      WHEN 3 THEN 'Média'::text
      WHEN 2 THEN 'Média'::text
      ELSE 'Baixa'::text
    END AS sev_label,
    kb.solution,
    round(EXTRACT(epoch FROM now() - v."Last_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
    CASE v."Severity"::integer
      WHEN 5 THEN 15
      WHEN 4 THEN 30
      WHEN 3 THEN 90
      WHEN 2 THEN 90
      ELSE 180
    END AS threshold
  FROM vulnerabilities v
  LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
)
SELECT
  sev_label AS sev,
  count(*) FILTER (WHERE age <= threshold AND solution IS NOT NULL)::integer AS "DentroSLA_Corr",
  count(*) FILTER (WHERE age <= threshold AND solution IS NULL)::integer AS "DentroSLA_NaoCorr",
  count(*) FILTER (WHERE age > threshold AND solution IS NOT NULL)::integer AS "ForaSLA_Corr",
  count(*) FILTER (WHERE age > threshold AND solution IS NULL)::integer AS "ForaSLA_NaoCorr"
FROM base
GROUP BY sev_label;

DROP MATERIALIZED VIEW IF EXISTS "mv_team_sla_current_year";
CREATE MATERIALIZED VIEW "mv_team_sla_current_year" AS WITH assets AS (
  SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID",
    "All_Assets".team,
    "All_Assets".is_cloud
  FROM "All_Assets"
), base AS (
  SELECT COALESCE(a.team, 'Unknown'::text) AS team,
    'full'::text AS scope,
    CASE v."Severity"::integer
      WHEN 5 THEN 'Crítica'::text
      WHEN 4 THEN 'Alta'::text
      WHEN 3 THEN 'Média'::text
      WHEN 2 THEN 'Média'::text
      ELSE 'Baixa'::text
    END AS sev_label,
    kb.solution,
    round(EXTRACT(epoch FROM now() - v."Last_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
    CASE v."Severity"::integer
      WHEN 5 THEN 15
      WHEN 4 THEN 30
      WHEN 3 THEN 90
      WHEN 2 THEN 90
      ELSE 180
    END AS threshold
  FROM vulnerabilities v
  JOIN assets a ON v."QG_HostID" = a."QG_HostID"
  LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
  UNION ALL
  SELECT 'All Cloud'::text AS team,
    'full-cloud'::text AS scope,
    CASE v."Severity"::integer
      WHEN 5 THEN 'Crítica'::text
      WHEN 4 THEN 'Alta'::text
      WHEN 3 THEN 'Média'::text
      WHEN 2 THEN 'Média'::text
      ELSE 'Baixa'::text
    END AS sev_label,
    kb.solution,
    round(EXTRACT(epoch FROM now() - v."Last_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
    CASE v."Severity"::integer
      WHEN 5 THEN 15
      WHEN 4 THEN 30
      WHEN 3 THEN 90
      WHEN 2 THEN 90
      ELSE 180
    END AS threshold
  FROM vulnerabilities v
  JOIN assets a ON v."QG_HostID" = a."QG_HostID"
  LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  WHERE a.is_cloud = true
    AND v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
  UNION ALL
  SELECT 'All On-Prem'::text AS team,
    'full-on-premise'::text AS scope,
    CASE v."Severity"::integer
      WHEN 5 THEN 'Crítica'::text
      WHEN 4 THEN 'Alta'::text
      WHEN 3 THEN 'Média'::text
      WHEN 2 THEN 'Média'::text
      ELSE 'Baixa'::text
    END AS sev_label,
    kb.solution,
    round(EXTRACT(epoch FROM now() - v."Last_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
    CASE v."Severity"::integer
      WHEN 5 THEN 15
      WHEN 4 THEN 30
      WHEN 3 THEN 90
      WHEN 2 THEN 90
      ELSE 180
    END AS threshold
  FROM vulnerabilities v
  JOIN assets a ON v."QG_HostID" = a."QG_HostID"
  LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  WHERE a.is_cloud = false
    AND v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
)
SELECT
  team,
  scope,
  sev_label AS sev,
  count(*) FILTER (WHERE age <= threshold AND solution IS NOT NULL)::integer AS "DentroSLA_Corr",
  count(*) FILTER (WHERE age <= threshold AND solution IS NULL)::integer AS "DentroSLA_NaoCorr",
  count(*) FILTER (WHERE age > threshold AND solution IS NOT NULL)::integer AS "ForaSLA_Corr",
  count(*) FILTER (WHERE age > threshold AND solution IS NULL)::integer AS "ForaSLA_NaoCorr"
FROM base
GROUP BY team, scope, sev_label;

DROP MATERIALIZED VIEW IF EXISTS "mv_report_summary_current_year";
CREATE MATERIALIZED VIEW "mv_report_summary_current_year" AS
SELECT
  count(DISTINCT a."QG_HostID")::integer AS "totalAssets",
  count(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::integer = 5)::integer AS "assetsWithCritical",
  count(*)::integer AS "totalVulns"
FROM vulnerabilities v
JOIN (SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID" FROM "All_Assets") a
  ON v."QG_HostID" = a."QG_HostID"
WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now());

DROP MATERIALIZED VIEW IF EXISTS "mv_report_os_current_year";
CREATE MATERIALIZED VIEW "mv_report_os_current_year" AS
SELECT
  COALESCE(a."OS", 'Unknown'::text) AS os,
  count(DISTINCT a."QG_HostID")::integer AS assets,
  count(*)::integer AS vulns,
  count(*) FILTER (WHERE v."Severity"::integer = 5)::integer AS critical
FROM vulnerabilities v
JOIN (SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID", "All_Assets"."OS" FROM "All_Assets") a
  ON v."QG_HostID" = a."QG_HostID"
WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
GROUP BY a."OS"
ORDER BY count(*)::integer DESC
LIMIT 20;

DROP MATERIALIZED VIEW IF EXISTS "mv_report_topqids_current_year";
CREATE MATERIALIZED VIEW "mv_report_topqids_current_year" AS
SELECT
  v."QID"::integer AS qid,
  max(kb.title) AS title,
  CASE v."Severity"::integer
    WHEN 5 THEN 'Crítica'::text
    WHEN 4 THEN 'Alta'::text
    WHEN 3 THEN 'Média'::text
    WHEN 2 THEN 'Média'::text
    ELSE 'Baixa'::text
  END AS sev,
  count(*)::integer AS count
FROM vulnerabilities v
JOIN (SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID" FROM "All_Assets") a
  ON v."QG_HostID" = a."QG_HostID"
LEFT JOIN kb_summary kb ON v."QID" = kb.qid
WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
GROUP BY v."QID", (
  CASE v."Severity"::integer
    WHEN 5 THEN 'Crítica'::text
    WHEN 4 THEN 'Alta'::text
    WHEN 3 THEN 'Média'::text
    WHEN 2 THEN 'Média'::text
    ELSE 'Baixa'::text
  END)
ORDER BY count(*)::integer DESC
LIMIT 25;

DROP MATERIALIZED VIEW IF EXISTS "mv_report_categories_current_year";
CREATE MATERIALIZED VIEW "mv_report_categories_current_year" AS
SELECT
  COALESCE(kb.category, 'Unknown'::text) AS name,
  CASE v."Severity"::integer
    WHEN 5 THEN 'Crítica'::text
    WHEN 4 THEN 'Alta'::text
    WHEN 3 THEN 'Média'::text
    WHEN 2 THEN 'Média'::text
    ELSE 'Baixa'::text
  END AS sev,
  count(*)::integer AS count
FROM vulnerabilities v
JOIN (SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID" FROM "All_Assets") a
  ON v."QG_HostID" = a."QG_HostID"
LEFT JOIN kb_summary kb ON v."QID" = kb.qid
WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
GROUP BY COALESCE(kb.category, 'Unknown'::text), (
  CASE v."Severity"::integer
    WHEN 5 THEN 'Crítica'::text
    WHEN 4 THEN 'Alta'::text
    WHEN 3 THEN 'Média'::text
    WHEN 2 THEN 'Média'::text
    ELSE 'Baixa'::text
  END)
ORDER BY count(*)::integer DESC
LIMIT 20;

DROP MATERIALIZED VIEW IF EXISTS "mv_report_assets_current_year";
CREATE MATERIALIZED VIEW "mv_report_assets_current_year" AS
SELECT
  a."QG_HostID" AS "qgHostId",
  COALESCE(a."DNS", a."IP") AS hostname,
  a."IP" AS ip,
  COALESCE(a."OS", 'Unknown'::text) AS os,
  COALESCE(a.team, 'Unknown'::text) AS team,
  count(*)::integer AS vulns,
  count(*) FILTER (WHERE v."Severity"::integer = 5)::integer AS critical
FROM vulnerabilities v
JOIN (
  SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID",
    "All_Assets"."DNS",
    "All_Assets"."IP",
    "All_Assets"."OS",
    "All_Assets".team
  FROM "All_Assets"
) a ON v."QG_HostID" = a."QG_HostID"
WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
GROUP BY a."QG_HostID", a."DNS", a."IP", a."OS", COALESCE(a.team, 'Unknown'::text)
ORDER BY count(*)::integer DESC
LIMIT 100;

DROP MATERIALIZED VIEW IF EXISTS "mv_report_teamrows_current_year";
CREATE MATERIALIZED VIEW "mv_report_teamrows_current_year" AS
SELECT
  COALESCE(a.team, 'Unknown'::text) AS team,
  count(DISTINCT a."QG_HostID")::integer AS assets,
  count(*)::integer AS vulns,
  count(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::integer = 5)::integer AS critical
FROM vulnerabilities v
JOIN (SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID", "All_Assets".team FROM "All_Assets") a
  ON v."QG_HostID" = a."QG_HostID"
WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
GROUP BY COALESCE(a.team, 'Unknown'::text)
ORDER BY count(*)::integer DESC
LIMIT 50;

DROP MATERIALIZED VIEW IF EXISTS "mv_top_qids_current_year";
CREATE MATERIALIZED VIEW "mv_top_qids_current_year" AS WITH base AS (
  SELECT
    v."QID"::integer AS qid,
    max(kb.title) AS title,
    CASE v."Severity"::integer
      WHEN 5 THEN 'Crítica'::text
      WHEN 4 THEN 'Alta'::text
      WHEN 3 THEN 'Média'::text
      WHEN 2 THEN 'Média'::text
      ELSE 'Baixa'::text
    END AS sev,
    COALESCE(a.team, 'Unknown'::text) AS team,
    COALESCE(kb.category, 'Unknown'::text) AS action,
    count(*)::integer AS count,
    count(*) FILTER (WHERE kb.solution IS NOT NULL)::integer AS corr,
    count(*) FILTER (WHERE kb.solution IS NULL)::integer AS "naoCorr",
    max(round(EXTRACT(epoch FROM now() - v."Last_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer) AS age,
    max(kb.solution) AS solution,
    max(v."Status") AS status
  FROM vulnerabilities v
  JOIN (SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID", "All_Assets".team FROM "All_Assets") a
    ON v."QG_HostID" = a."QG_HostID"
  LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
  GROUP BY v."QID", a.team, kb.category, v."Severity"
  ORDER BY count(*)::integer DESC
  LIMIT 120
)
SELECT qid, title, sev, team, action, count, corr, "naoCorr", age, solution, status
FROM base;

DROP MATERIALIZED VIEW IF EXISTS "mv_top_assets_current_year";
CREATE MATERIALIZED VIEW "mv_top_assets_current_year" AS WITH base AS (
  SELECT
    a."IP" AS ip,
    COALESCE(a."DNS", ''::text) AS dns,
    COALESCE(a."OS", ''::text) AS os,
    COALESCE(a.team, 'Unknown'::text) AS team,
    count(*)::integer AS vulns,
    max(round(EXTRACT(epoch FROM now() - v."Last_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer) AS "maxAge",
    count(*) FILTER (WHERE v."Severity"::integer = 5)::integer AS crit
  FROM vulnerabilities v
  JOIN (
    SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID",
      "All_Assets"."IP",
      "All_Assets"."DNS",
      "All_Assets"."OS",
      "All_Assets".team
    FROM "All_Assets"
  ) a ON v."QG_HostID" = a."QG_HostID"
  WHERE v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
  GROUP BY a."IP", a."DNS", a."OS", COALESCE(a.team, 'Unknown'::text)
  ORDER BY count(*)::integer DESC
  LIMIT 100
)
SELECT ip, dns, os, team, vulns, "maxAge", crit FROM base;
