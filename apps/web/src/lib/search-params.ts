import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

export const PERIODS = ["all", "trending"] as const;

export const LEADERBOARD_PARAMS = {
  q: parseAsString.withDefault(""),
  period: parseAsStringLiteral(PERIODS).withDefault("all"),
};
export const loadLeaderboardParams = createLoader(LEADERBOARD_PARAMS);
