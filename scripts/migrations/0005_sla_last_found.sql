DROP MATERIALIZED VIEW IF EXISTS "mv_team_sla";
DROP MATERIALIZED VIEW IF EXISTS "mv_sla";

CREATE MATERIALIZED VIEW "mv_sla" AS WITH base AS (
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
)
SELECT
  sev_label AS sev,
  count(*) FILTER (WHERE age <= threshold AND solution IS NOT NULL)::integer AS "DentroSLA_Corr",
  count(*) FILTER (WHERE age <= threshold AND solution IS NULL)::integer AS "DentroSLA_NaoCorr",
  count(*) FILTER (WHERE age > threshold AND solution IS NOT NULL)::integer AS "ForaSLA_Corr",
  count(*) FILTER (WHERE age > threshold AND solution IS NULL)::integer AS "ForaSLA_NaoCorr"
FROM base
GROUP BY sev_label;

CREATE MATERIALIZED VIEW "mv_team_sla" AS WITH assets AS (
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
