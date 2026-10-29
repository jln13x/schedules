import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { Layer, Redacted } from "effect";
import { FetchHttpClient } from "effect/http";
import { env } from "@/env";
import { JEV_MODEL } from "./schedulable";

export const JevLayer = TypeSafeDecisionModel.layer({ model: JEV_MODEL }).pipe(
  Layer.provide(TypeSafeClient.layer({ apiKey: Redacted.make(env.TYPESAFE_API_KEY) })),
  Layer.provide(FetchHttpClient.layer),
);
