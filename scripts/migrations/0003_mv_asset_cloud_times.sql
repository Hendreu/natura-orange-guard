UPDATE "All_Assets" SET is_cloud = NULL;

DROP MATERIALIZED VIEW IF EXISTS mv_asset_cloud;

CREATE MATERIALIZED VIEW mv_asset_cloud AS
WITH RECURSIVE cloud_tree AS (
  SELECT id FROM tags WHERE LOWER(name) = 'times:cloud'
  UNION ALL
  SELECT t.id FROM tags t JOIN cloud_tree ON t.parent_tag_id = cloud_tree.id
),
onprem_tree AS (
  SELECT id FROM tags WHERE LOWER(name) = 'times:on-prem'
  UNION ALL
  SELECT t.id FROM tags t JOIN onprem_tree ON t.parent_tag_id = onprem_tree.id
),
easm_tags AS (
  SELECT id FROM tags WHERE LOWER(name) IN ('times:easm', 'type: easm', 'easm', 'internet facing assets')
),
asset_cloud AS (
  SELECT DISTINCT at.asset_id
  FROM asset_tags at
  JOIN cloud_tree ct ON ct.id = at.tag_id
  UNION
  SELECT DISTINCT at.asset_id
  FROM asset_tags at
  JOIN easm_tags et ON et.id = at.tag_id
),
asset_onprem AS (
  SELECT DISTINCT at.asset_id
  FROM asset_tags at
  JOIN onprem_tree ot ON ot.id = at.tag_id
)
SELECT a."ID" AS asset_id,
  CASE
    WHEN ac.asset_id IS NOT NULL THEN true
    WHEN ao.asset_id IS NOT NULL THEN false
  END AS is_cloud
FROM "All_Assets" a
LEFT JOIN asset_cloud ac ON ac.asset_id = a."ID"
LEFT JOIN asset_onprem ao ON ao.asset_id = a."ID"
WHERE ac.asset_id IS NOT NULL OR ao.asset_id IS NOT NULL;

CREATE UNIQUE INDEX idx_mv_asset_cloud_asset_id ON mv_asset_cloud(asset_id);
CREATE INDEX idx_mv_asset_cloud_is_cloud ON mv_asset_cloud(is_cloud);
