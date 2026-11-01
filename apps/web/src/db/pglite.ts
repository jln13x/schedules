import { PGlite } from "@electric-sql/pglite";
import { pushSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";
import { Effect, Layer } from "effect";
import { Database, type Db } from "./database";
import * as schema from "./schema";

/** An in-memory Postgres with the schema, for tests. Booting it takes seconds. */
export const PgliteDatabase = Layer.effect(
  Database,
  Effect.promise(async () => {
    const client = await PGlite.create();
    const db = drizzle({ client, schema });
    const { apply } = await pushSchema(schema, db as unknown as Parameters<typeof pushSchema>[1]);
    await apply();
    return Database.make(db as Db);
  }),
);
