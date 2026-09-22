import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./apps/agent/src/storage/schema.ts",
	out: "./apps/agent/src/storage/migrations",
});
