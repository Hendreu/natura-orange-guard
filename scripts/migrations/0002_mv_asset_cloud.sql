CREATE MATERIALIZED VIEW IF NOT EXISTS mv_asset_cloud AS
SELECT
  a."ID" AS asset_id,
  EXISTS (
    SELECT 1
    FROM tags t
    WHERE LOWER(t.name) LIKE 'type: cloud%'
      AND CONCAT(',', REPLACE(a."Tags", '\n', ''), ',')
          ILIKE CONCAT('%,', REPLACE(t.name, '\n', ''), ',%')
  ) AS is_cloud
FROM "All_Assets" a
WHERE a."Tags" IS NOT NULL
  AND TRIM(a."Tags") <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_asset_cloud_asset_id ON mv_asset_cloud(asset_id);
