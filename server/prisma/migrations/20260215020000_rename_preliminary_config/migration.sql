-- Rename table: preliminary_round_robin_configs → preliminary_configs
ALTER TABLE "preliminary_round_robin_configs" RENAME TO "preliminary_configs";

-- Rename column: finalRoundRobinSize → finalSize
ALTER TABLE "preliminary_configs" RENAME COLUMN "finalRoundRobinSize" TO "finalSize";
