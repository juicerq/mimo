import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dataPath } from "../storage/home";
import { readJsonFile, writeTextFile } from "../storage/files";

const STORE_PATH = dataPath("routines.json");
const LEASE_MINUTES = 5;

export const RoutineNameSchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/);

const storedSchema = z.object({
	id: z.string().min(1),
	name: RoutineNameSchema.optional(),
	prompt: z.string().min(1),
	everyMinutes: z.number().int().min(1),
	botId: z.uuid(),
	createdAt: z.string(),
	nextRunAt: z.string(),
	lastRunAt: z.string().optional(),
	lastError: z.string().optional(),
	enabled: z.boolean(),
	leaseUntil: z.string().optional(),
});

const storeSchema = z.object({
	routines: z.array(storedSchema),
});

type StoredRoutine = z.infer<typeof storedSchema>;

export type Routine = Omit<StoredRoutine, "name"> & { name: string };

export interface RoutineView {
	name: string;
	prompt: string;
	everyMinutes: number;
	nextRunAt: string;
	lastRunAt: string | null;
	lastError: string | null;
	enabled: boolean;
}

export function routineView(routine: Routine): RoutineView {
	return {
		name: routine.name,
		prompt: routine.prompt,
		everyMinutes: routine.everyMinutes,
		nextRunAt: routine.nextRunAt,
		lastRunAt: routine.lastRunAt ?? null,
		lastError: routine.lastError ?? null,
		enabled: routine.enabled,
	};
}

export interface RoutineInput {
	name: string;
	prompt: string;
	everyMinutes: number;
	startInMinutes: number;
	botId: string;
}

export interface RoutinePatch {
	name?: string;
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

function named(routine: StoredRoutine, index: number): Routine {
	return { ...routine, name: routine.name ?? `rotina-${index + 1}` };
}

async function readRoutines(): Promise<Routine[]> {
	const store = await readJsonFile(STORE_PATH, storeSchema);
	return (store?.routines ?? []).map(named);
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

function requireNamed(routines: Routine[], name: string): Routine {
	const routine = routines.find((candidate) => candidate.name === name);
	if (!routine) {
		throw new Error(`Você não tem uma rotina chamada ${name}. Veja os nomes com list_routines.`);
	}
	return routine;
}

function requireFreeName(routines: Routine[], botId: string, name: string): void {
	if (routines.some((routine) => routine.botId === botId && routine.name === name)) {
		throw new Error(`Você já tem uma rotina chamada ${name}.`);
	}
}

export async function createRoutine(input: RoutineInput): Promise<Routine> {
	return serialize(async () => {
		const now = new Date();
		const routines = await readRoutines();
		requireFreeName(routines, input.botId, input.name);
		const routine: Routine = {
			id: randomUUID(),
			name: input.name,
			prompt: input.prompt,
			everyMinutes: input.everyMinutes,
			botId: input.botId,
			createdAt: now.toISOString(),
			nextRunAt: minutesFrom(now, input.startInMinutes),
			enabled: true,
		};
		await writeStore([...routines, routine]);
		return routine;
	});
}

export async function updateRoutine(target: Pick<Routine, "name" | "botId">, patch: RoutinePatch): Promise<Routine> {
	return serialize(async () => {
		const routines = await readRoutines();
		const current = requireNamed(routines.filter((routine) => routine.botId === target.botId), target.name);
		const updated: Routine = { ...current };
		if (patch.name !== undefined && patch.name !== current.name) {
			requireFreeName(routines, target.botId, patch.name);
			updated.name = patch.name;
		}
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

export async function deleteRoutine(target: Pick<Routine, "name" | "botId">): Promise<boolean> {
	return serialize(async () => {
		const routines = await readRoutines();
		const remaining = routines.filter((routine) => routine.name !== target.name || routine.botId !== target.botId);
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
