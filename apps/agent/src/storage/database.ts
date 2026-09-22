import { chmodSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Sqlite from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dataPath } from "./home";

let connection: BetterSQLite3Database | undefined;

export type Store = Pick<BetterSQLite3Database, "select" | "insert" | "update" | "delete">;

export function database(): BetterSQLite3Database {
	if (connection) {
		return connection;
	}
	mkdirSync(dataPath(), { recursive: true, mode: 0o700 });
	const path = dataPath("mimo.sqlite");
	const sqlite = new Sqlite(path);
	chmodSync(path, 0o600);
	sqlite.pragma("foreign_keys = ON");
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("synchronous = FULL");
	const db = drizzle(sqlite);
	try {
		migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
	} catch (error) {
		sqlite.close();
		throw error;
	}
	connection = db;
	return db;
}
