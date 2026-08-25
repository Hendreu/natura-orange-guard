DROP MATERIALIZED VIEW IF EXISTS "mv_chart_sev";
CREATE MATERIALIZED VIEW "mv_chart_sev" AS SELECT
        CASE "Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    count(*)::integer AS total
   FROM vulnerabilities v
  GROUP BY (CASE "Severity"::integer     WHEN 5 THEN 'Crítica'::text     WHEN 4 THEN 'Alta'::text     WHEN 3 THEN 'Média'::text     WHEN 2 THEN 'Média'::text     ELSE 'Baixa'::text   END);

DROP MATERIALIZED VIEW IF EXISTS "mv_hardening_categories";
CREATE MATERIALIZED VIEW "mv_hardening_categories" AS SELECT COALESCE(kb.category, 'Unknown'::text) AS name,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    count(*)::integer AS count
   FROM vulnerabilities v
     JOIN ( SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID"
           FROM "All_Assets"
          WHERE "All_Assets".is_cloud = true) a ON v."QG_HostID" = a."QG_HostID"
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  GROUP BY kb.category, (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END)
  ORDER BY (count(*)) DESC
 LIMIT 10;

DROP MATERIALIZED VIEW IF EXISTS "mv_hardening_topqids";
CREATE MATERIALIZED VIEW "mv_hardening_topqids" AS SELECT v."QID"::integer AS qid,
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
     JOIN ( SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID"
           FROM "All_Assets"
          WHERE "All_Assets".is_cloud = true) a ON v."QG_HostID" = a."QG_HostID"
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  GROUP BY v."QID", (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END)
  ORDER BY (count(*)) DESC
 LIMIT 10;

DROP MATERIALIZED VIEW IF EXISTS "mv_raw";
CREATE MATERIALIZED VIEW "mv_raw" AS SELECT
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    COALESCE(kb.category, 'Unknown'::text) AS action,
    count(*)::integer AS total,
    round(avg(round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer), 1)::double precision AS avg_age,
    count(DISTINCT v."QID")::integer AS qids
   FROM vulnerabilities v
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  GROUP BY (v."Severity"::integer), (COALESCE(kb.category, 'Unknown'::text));

DROP MATERIALIZED VIEW IF EXISTS "mv_report_categories";
CREATE MATERIALIZED VIEW "mv_report_categories" AS SELECT COALESCE(kb.category, 'Unknown'::text) AS name,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    count(*)::integer AS count
   FROM vulnerabilities v
     JOIN ( SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID"
           FROM "All_Assets") a ON v."QG_HostID" = a."QG_HostID"
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  GROUP BY (COALESCE(kb.category, 'Unknown'::text)), (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END)
  ORDER BY (count(*)) DESC
 LIMIT 20;

DROP MATERIALIZED VIEW IF EXISTS "mv_report_topqids";
CREATE MATERIALIZED VIEW "mv_report_topqids" AS SELECT v."QID"::integer AS qid,
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
     JOIN ( SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID"
           FROM "All_Assets") a ON v."QG_HostID" = a."QG_HostID"
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  GROUP BY v."QID", (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END)
  ORDER BY (count(*)) DESC
 LIMIT 25;

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
            round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
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
 SELECT sev_label AS sev,
    count(*) FILTER (WHERE age <= threshold AND solution IS NOT NULL)::integer AS "DentroSLA_Corr",
    count(*) FILTER (WHERE age <= threshold AND solution IS NULL)::integer AS "DentroSLA_NaoCorr",
    count(*) FILTER (WHERE age > threshold AND solution IS NOT NULL)::integer AS "ForaSLA_Corr",
    count(*) FILTER (WHERE age > threshold AND solution IS NULL)::integer AS "ForaSLA_NaoCorr"
   FROM base
  GROUP BY sev_label;

DROP MATERIALIZED VIEW IF EXISTS "mv_team_chart_sev";
CREATE MATERIALIZED VIEW "mv_team_chart_sev" AS WITH assets AS (
         SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID",
            "All_Assets".team,
            "All_Assets".is_cloud
           FROM "All_Assets"
        )
 SELECT COALESCE(a.team, 'Unknown'::text) AS team,
    'full'::text AS scope,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    count(*)::integer AS total
   FROM vulnerabilities v
     JOIN assets a ON v."QG_HostID" = a."QG_HostID"
  GROUP BY (COALESCE(a.team, 'Unknown'::text)), (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END)
UNION ALL
 SELECT 'All Cloud'::text AS team,
    'full-cloud'::text AS scope,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    count(*)::integer AS total
   FROM vulnerabilities v
     JOIN assets a ON v."QG_HostID" = a."QG_HostID"
  WHERE a.is_cloud = true
  GROUP BY (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END)
UNION ALL
 SELECT 'All On-Prem'::text AS team,
    'full-on-premise'::text AS scope,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    count(*)::integer AS total
   FROM vulnerabilities v
     JOIN assets a ON v."QG_HostID" = a."QG_HostID"
  WHERE a.is_cloud = false
  GROUP BY (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END);

DROP MATERIALIZED VIEW IF EXISTS "mv_team_raw";
CREATE MATERIALIZED VIEW "mv_team_raw" AS WITH assets AS (
         SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID",
            "All_Assets".team,
            "All_Assets".is_cloud
           FROM "All_Assets"
        )
 SELECT COALESCE(a.team, 'Unknown'::text) AS team,
    'full'::text AS scope,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    COALESCE(kb.category, 'Unknown'::text) AS action,
    count(*)::integer AS total,
    round(avg(round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer), 1)::double precision AS avg_age,
    count(DISTINCT v."QID")::integer AS qids
   FROM vulnerabilities v
     JOIN assets a ON v."QG_HostID" = a."QG_HostID"
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  GROUP BY (COALESCE(a.team, 'Unknown'::text)), (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END), (COALESCE(kb.category, 'Unknown'::text))
UNION ALL
 SELECT 'All Cloud'::text AS team,
    'full-cloud'::text AS scope,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    COALESCE(kb.category, 'Unknown'::text) AS action,
    count(*)::integer AS total,
    round(avg(round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer), 1)::double precision AS avg_age,
    count(DISTINCT v."QID")::integer AS qids
   FROM vulnerabilities v
     JOIN assets a ON v."QG_HostID" = a."QG_HostID"
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  WHERE a.is_cloud = true
  GROUP BY (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END), (COALESCE(kb.category, 'Unknown'::text))
UNION ALL
 SELECT 'All On-Prem'::text AS team,
    'full-on-premise'::text AS scope,
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END AS sev,
    COALESCE(kb.category, 'Unknown'::text) AS action,
    count(*)::integer AS total,
    round(avg(round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer), 1)::double precision AS avg_age,
    count(DISTINCT v."QID")::integer AS qids
   FROM vulnerabilities v
     JOIN assets a ON v."QG_HostID" = a."QG_HostID"
     LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  WHERE a.is_cloud = false
  GROUP BY (
        CASE v."Severity"::integer
            WHEN 5 THEN 'Crítica'::text
            WHEN 4 THEN 'Alta'::text
            WHEN 3 THEN 'Média'::text
            WHEN 2 THEN 'Média'::text
            ELSE 'Baixa'::text
        END), (COALESCE(kb.category, 'Unknown'::text));

DROP MATERIALIZED VIEW IF EXISTS "mv_team_sla";
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
            round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
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
            round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
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
            round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer AS age,
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
 SELECT team,
    scope,
    sev_label AS sev,
    count(*) FILTER (WHERE age <= threshold AND solution IS NOT NULL)::integer AS "DentroSLA_Corr",
    count(*) FILTER (WHERE age <= threshold AND solution IS NULL)::integer AS "DentroSLA_NaoCorr",
    count(*) FILTER (WHERE age > threshold AND solution IS NOT NULL)::integer AS "ForaSLA_Corr",
    count(*) FILTER (WHERE age > threshold AND solution IS NULL)::integer AS "ForaSLA_NaoCorr"
   FROM base
  GROUP BY team, scope, sev_label;

DROP MATERIALIZED VIEW IF EXISTS "mv_top_qids";
CREATE MATERIALIZED VIEW "mv_top_qids" AS WITH base AS (
         SELECT v."QID"::integer AS qid,
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
            max(round(EXTRACT(epoch FROM now() - v."First_Found_Datetime"::timestamp without time zone::timestamp with time zone) / 86400::numeric)::integer) AS age,
            max(kb.solution) AS solution,
            max(v."Status") AS status
           FROM vulnerabilities v
             JOIN ( SELECT DISTINCT ON ("All_Assets"."QG_HostID") "All_Assets"."QG_HostID",
                    "All_Assets".team
                   FROM "All_Assets") a ON v."QG_HostID" = a."QG_HostID"
             LEFT JOIN kb_summary kb ON v."QID" = kb.qid
          GROUP BY v."QID", a.team, kb.category, v."Severity"
          ORDER BY (count(*)::integer) DESC
         LIMIT 120
        )
 SELECT qid,
    title,
    sev,
    team,
    action,
    count,
    corr,
    "naoCorr",
    age,
    solution,
    status
   FROM base;
