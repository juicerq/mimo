import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dataPath } from "../storage/data";
import { readJsonFile, writeTextFile } from "../storage/files";

const STORE_PATH = dataPath("routines.json");
const LEASE_MINUTES = 5;

const routineSchema = z.object({
	id: z.string().min(1),
	prompt: z.string().min(1),
	everyMinutes: z.number().int().min(1),
	botId: z.uuid(),
	sessionId: z.string().min(1),
	createdAt: z.string(),
	nextRunAt: z.string(),
	lastRunAt: z.string().optional(),
	lastError: z.string().optional(),
	enabled: z.boolean(),
	leaseUntil: z.string().optional(),
});

const storeSchema = z.object({
	routines: z.array(routineSchema),
});

export type Routine = z.infer<typeof routineSchema>;

export interface RoutineView {
	id: string;
	prompt: string;
	everyMinutes: number;
	nextRunAt: string;
	lastRunAt: string | null;
	lastError: string | null;
	enabled: boolean;
}

export function routineView(routine: Routine): RoutineView {
	return {
		id: routine.id,
		prompt: routine.prompt,
		everyMinutes: routine.everyMinutes,
		nextRunAt: routine.nextRunAt,
		lastRunAt: routine.lastRunAt ?? null,
		lastError: routine.lastError ?? null,
		enabled: routine.enabled,
	};
}

export interface RoutineInput {
	prompt: string;
	everyMinutes: number;
	startInMinutes: number;
	botId: string;
	sessionId: string;
}

export interface RoutinePatch {
	prompt?: string;
	everyMinutes?: number;
	enabled?: boolean;
}

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
	const result = queue.then(operation, operation);
	queue = result.then(
		() => {},
		() => {},
	);
	return result;
}

function minutesFrom(now: Date, minutes: number): string {
	return new Date(now.getTime() + minutes * 60_000).toISOString();
}

async function readRoutines(): Promise<Routine[]> {
	const store = await readJsonFile(STORE_PATH, storeSchema);
	return store?.routines ?? [];
}

export async function listRoutines(botId: string) {
	return await serialize(async () => (await readRoutines()).filter((routine) => routine.botId === botId));
}

async function writeStore(routines: Routine[]): Promise<void> {
	await writeTextFile(STORE_PATH, `${JSON.stringify({ routines }, null, "\t")}\n`, 0o600);
}

function requireRoutine(routines: Routine[], id: string): Routine {
	const routine = routines.find((candidate) => candidate.id === id);
	if (!routine) {
		throw new Error(`Rotina ${id} não encontrada.`);
	}
	return routine;
}

export async function createRoutine(input: RoutineInput): Promise<Routine> {
	return serialize(async () => {
		const now = new Date();
		const routine: Routine = {
			id: randomUUID(),
			prompt: input.prompt,
			everyMinutes: input.everyMinutes,
			botId: input.botId,
			sessionId: input.sessionId,
			createdAt: now.toISOString(),
			nextRunAt: minutesFrom(now, input.startInMinutes),
			enabled: true,
		};
		await writeStore([...(await readRoutines()), routine]);
		return routine;
	});
}

export async function updateRoutine(target: Pick<Routine, "id" | "botId">, patch: RoutinePatch): Promise<Routine> {
	return serialize(async () => {
		const routines = await readRoutines();
		const current = requireRoutine(routines.filter((routine) => routine.botId === target.botId), target.id);
		const updated: Routine = { ...current };
		if (patch.prompt !== undefined) {
			updated.prompt = patch.prompt;
		}
		if (patch.everyMinutes !== undefined) {
			updated.everyMinutes = patch.everyMinutes;
			updated.nextRunAt = minutesFrom(new Date(), patch.everyMinutes);
		}
		if (patch.enabled !== undefined) {
			updated.enabled = patch.enabled;
		}
		routines[routines.indexOf(current)] = updated;
		await writeStore(routines);
		return updated;
	});
}

export async function deleteRoutine(target: Pick<Routine, "id" | "botId">): Promise<boolean> {
	return serialize(async () => {
		const routines = await readRoutines();
		const remaining = routines.filter((routine) => routine.id !== target.id || routine.botId !== target.botId);
		if (remaining.length === routines.length) {
			return false;
		}
		await writeStore(remaining);
		return true;
	});
}

export async function deleteBotRoutines(botId: string): Promise<number> {
	return serialize(async () => {
		const routines = await readRoutines();
		const remaining = routines.filter((routine) => routine.botId !== botId);
		if (remaining.length === routines.length) {
			return 0;
		}
		await writeStore(remaining);
		return routines.length - remaining.length;
	});
}

function isDue(routine: Routine, now: Date): boolean {
	if (!routine.enabled || new Date(routine.nextRunAt).getTime() > now.getTime()) {
		return false;
	}
	return routine.leaseUntil === undefined || new Date(routine.leaseUntil).getTime() <= now.getTime();
}

export async function claimDue(now: Date, limit: number) {
	return serialize(async () => {
		const routines = await readRoutines();
		const due = routines
			.filter((routine) => isDue(routine, now))
			.sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt))
			.slice(0, limit);
		if (due.length === 0) {
			return [];
		}
		const claimed = new Set(due.map((routine) => routine.id));
		const leaseUntil = minutesFrom(now, LEASE_MINUTES);
		const updated = routines.map((routine) => (claimed.has(routine.id) ? { ...routine, leaseUntil } : routine));
		await writeStore(updated);
		return updated.filter((routine) => claimed.has(routine.id));
	});
}

export async function completeRoutine(id: string, now: Date): Promise<void> {
	await serialize(async () => {
		const routines = await readRoutines();
		const current = requireRoutine(routines, id);
		routines[routines.indexOf(current)] = {
			...current,
			lastRunAt: now.toISOString(),
			nextRunAt: minutesFrom(now, current.everyMinutes),
			leaseUntil: undefined,
			lastError: undefined,
		};
		await writeStore(routines);
	});
}

export async function failRoutine(id: string, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	await serialize(async () => {
		const routines = await readRoutines();
		const current = requireRoutine(routines, id);
		routines[routines.indexOf(current)] = { ...current, leaseUntil: undefined, lastError: message };
		await writeStore(routines);
	});
}
