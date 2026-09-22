import { z } from "zod";
import { database } from "./database";
import { preferences } from "./schema";

export const Preferences = z.object({
	"mimo:theme": z.enum(["light", "dark"]).optional(),
	"mimo:detail": z.enum(["brief", "full"]).optional(),
	"mimo:bot": z.string().optional(),
	"mimo:info": z.enum(["open", "closed"]).optional(),
});

export function readPreferences() {
	return Preferences.parse(Object.fromEntries(database().select().from(preferences).all().map((row) => [row.key, row.value])));
}

export function savePreferences(input: z.infer<typeof Preferences>): void {
	database().transaction((db) => {
		for (const [key, value] of Object.entries(input)) {
			if (!value) {
				continue;
			}
			db.insert(preferences).values({ key, value }).onConflictDoUpdate({ target: preferences.key, set: { value } }).run();
		}
	});
}
