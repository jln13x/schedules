import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Context, Effect, Layer, Schema } from "effect";
import { env } from "@/env";
import * as schema from "./schema";

/** A connection or a transaction; queries are written against whichever they are given. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
}) {}

export class Database extends Context.Service<
  Database,
  {
    readonly query: <A>(run: (db: Db) => Promise<A>) => Effect.Effect<A, DatabaseError>;
    readonly transaction: <A>(run: (tx: Db) => Promise<A>) => Effect.Effect<A, DatabaseError>;
  }
>()("schedules/db/Database") {
  static readonly make = (db: Db) =>
    Database.of({
      query: (run) =>
        Effect.tryPromise({ try: () => run(db), catch: (cause) => new DatabaseError({ cause }) }),
      transaction: (run) =>
        Effect.tryPromise({
          try: () => db.transaction((tx) => run(tx)),
          catch: (cause) => new DatabaseError({ cause }),
        }),
    });

  static readonly query = <A>(run: (db: Db) => Promise<A>) =>
    Database.use((database) => database.query(run));

  static readonly transaction = <A>(run: (tx: Db) => Promise<A>) =>
    Database.use((database) => database.transaction(run));

  static readonly layer = Layer.sync(Database, () =>
    Database.make(drizzle(env.DATABASE_URL, { schema })),
  );
}
