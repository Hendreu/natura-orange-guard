-- Cria tabela de regras de classificação cloud
CREATE TABLE IF NOT EXISTS cloud_tag_rules (
  id serial PRIMARY KEY,
  tag_id bigint NOT NULL REFERENCES tags(id),
  include_children boolean NOT NULL DEFAULT false,
  is_cloud boolean NOT NULL DEFAULT true,
  UNIQUE(tag_id)
);

-- Limpa regras anteriores e insere as atuais
TRUNCATE cloud_tag_rules RESTART IDENTITY;

INSERT INTO cloud_tag_rules (tag_id, include_children, is_cloud) VALUES
  (81184311, true, true),   -- Times:Cloud (inclui toda a árvore)
  (85477825, false, true),  -- Times:EASM
  (91615725, false, true),  -- Type: EASM
  (82204506, false, true),  -- EASM
  (51455648, false, true);  -- Internet Facing Assets

-- Recria mv_asset_cloud usando as regras da tabela
DROP MATERIALIZED VIEW IF EXISTS mv_asset_cloud;

CREATE MATERIALIZED VIEW mv_asset_cloud AS
WITH RECURSIVE rule_tree AS (
  SELECT r.tag_id AS root_tag_id, r.include_children, t.id AS tag_id
  FROM cloud_tag_rules r
  JOIN tags t ON t.id = r.tag_id
  WHERE r.include_children = true

  UNION ALL

  SELECT rt.root_tag_id, rt.include_children, t.id
  FROM rule_tree rt
  JOIN tags t ON t.parent_tag_id = rt.tag_id
),
cloud_tags AS (
  SELECT DISTINCT tag_id
  FROM rule_tree

  UNION

  SELECT tag_id
  FROM cloud_tag_rules
  WHERE include_children = false
)
SELECT
  a."ID" AS asset_id,
  EXISTS (
    SELECT 1
    FROM asset_tags at
    WHERE at.asset_id = a."ID"
      AND at.tag_id IN (SELECT tag_id FROM cloud_tags)
  ) AS is_cloud
FROM "All_Assets" a;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_asset_cloud_asset_id ON mv_asset_cloud(asset_id);
CREATE INDEX IF NOT EXISTS idx_mv_asset_cloud_is_cloud ON mv_asset_cloud(is_cloud);
