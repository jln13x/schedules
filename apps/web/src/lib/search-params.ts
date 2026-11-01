import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

export const FIT_VALUES = ["you", "team"] as const;

export const SKILLS_PARAMS = {
  q: parseAsString.withDefault(""),
  fit: parseAsStringLiteral(FIT_VALUES),
};
export const loadSkillsParams = createLoader(SKILLS_PARAMS);
