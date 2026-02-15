-- Drop playoffBracketSize column — finalSize now serves both RR final size and playoff bracket size
ALTER TABLE "preliminary_configs" DROP COLUMN "playoffBracketSize";
