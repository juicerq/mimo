import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "../storage/database";
import { routines } from "../storage/schema";

export const RoutineNameSchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/);
export type Routine = typeof routines.$inferSelect;
export interface RoutineInput { name: string; prompt: string; everyMinutes: number; startInMinutes: number; botId: string }
export interface RoutinePatch { name?: string; prompt?: string; everyMinutes?: number; enabled?: boolean }

export function routineView(routine: Routine) {
	const { name, prompt, everyMinutes, nextRunAt, lastRunAt, lastError, enabled } = routine;
	return { name, prompt, everyMinutes, nextRunAt, lastRunAt, lastError, enabled };
}

function minutesFrom(now: Date, minutes: number): string {
	return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export async function listRoutines(botId: string): Promise<Routine[]> {
	return database().select().from(routines).where(eq(routines.botId, botId)).all();
}

export async function createRoutine(input: RoutineInput): Promise<Routine> {
	const now = new Date();
	const { startInMinutes, ...fields } = input;
	return database().insert(routines).values({ ...fields, id: randomUUID(), createdAt: now.toISOString(), nextRunAt: minutesFrom(now, startInMinutes), enabled: true }).returning().get();
}

export async function updateRoutine(target: Pick<Routine, "name" | "botId">, patch: RoutinePatch): Promise<Routine> {
	const existing = database().select().from(routines).where(and(eq(routines.botId, target.botId), eq(routines.name, target.name))).get();
	if (!existing) {
		throw new Error(`Você não tem uma rotina chamada ${target.name}. Veja os nomes com list_routines.`);
	}
	if (Object.values(patch).every((value) => value === undefined)) {
		return existing;
	}
	const row = database().update(routines).set({ ...patch, ...patch.everyMinutes !== undefined && { nextRunAt: minutesFrom(new Date(), patch.everyMinutes) } }).where(and(eq(routines.botId, target.botId), eq(routines.name, target.name))).returning().get();
	if (!row) {
		throw new Error(`Você não tem uma rotina chamada ${target.name}. Veja os nomes com list_routines.`);
	}
	return row;
}

export async function deleteRoutine(target: Pick<Routine, "name" | "botId">): Promise<boolean> {
	return database().delete(routines).where(and(eq(routines.botId, target.botId), eq(routines.name, target.name))).returning().all().length > 0;
}

export async function dueRoutines(now: Date): Promise<Routine[]> {
	return database().select().from(routines).where(eq(routines.enabled, true)).orderBy(routines.nextRunAt).all().filter((routine) => new Date(routine.nextRunAt).getTime() <= now.getTime());
}

export async function completeRoutine(id: string, now: Date): Promise<void> {
	const row = database().select().from(routines).where(eq(routines.id, id)).get();
	if (row) {
		database().update(routines).set({ lastRunAt: now.toISOString(), lastError: null, nextRunAt: minutesFrom(now, row.everyMinutes) }).where(eq(routines.id, id)).run();
	}
}

export async function failRoutine(id: string, error: unknown): Promise<void> {
	const row = database().select().from(routines).where(eq(routines.id, id)).get();
	if (row) {
		database().update(routines).set({ lastError: error instanceof Error ? error.message : String(error), nextRunAt: minutesFrom(new Date(), row.everyMinutes) }).where(eq(routines.id, id)).run();
	}
}
