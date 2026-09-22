import { palette, traits } from "blobatar";
import type { State } from "./bots";

const R = 50;
const SEP = 22;
const RISE = 10;
const YAW = 21;
const UP = 16;
const DOWN = 27;
const REACH = 141;
const FORE = 1.7;
const BULGE = 1;
const TILT = 0.7;
const LEAN = 0.22;
const STIFF = 160;
const WORK_STIFF = 90;
const DAMP = 16;
const LID_SPEED = 14;

const rad = (degrees: number): number => (degrees * Math.PI) / 180;
const deg = (radians: number): number => (radians * 180) / Math.PI;
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const n2 = (value: number): string => value.toFixed(2);

function superellipse(rx: number, ry: number, n: number): string {
	const steps = 72;
	const parts: string[] = [];

	for (let i = 0; i < steps; i++) {
		const t = (i / steps) * Math.PI * 2;
		const c = Math.cos(t);
		const s = Math.sin(t);
		const x = rx * Math.sign(c) * Math.abs(c) ** (2 / n);
		const y = ry * Math.sign(s) * Math.abs(s) ** (2 / n);
		parts.push(`${i ? "L" : "M"}${n2(x)} ${n2(y)}`);
	}

	return `${parts.join("")}Z`;
}

function polygon(rx: number, ry: number, sides: number, round: number, rot: number): string {
	const corners: [number, number][] = [];

	for (let i = 0; i < sides; i++) {
		const a = rad(rot) + (i / sides) * Math.PI * 2;
		corners.push([rx * Math.cos(a), ry * Math.sin(a)]);
	}

	const towards = ([px, py]: [number, number], [qx, qy]: [number, number], cut: number): [number, number] => {
		const dx = qx - px;
		const dy = qy - py;
		const len = Math.hypot(dx, dy) || 1;
		const step = Math.min(cut, len / 2);
		return [px + (dx / len) * step, py + (dy / len) * step];
	};

	const first = corners[0];
	const second = corners[1];
	const cut = (Math.hypot(first[0] - second[0], first[1] - second[1]) / 2) * round;
	const parts: string[] = [];

	for (let i = 0; i < sides; i++) {
		const here = corners[i];
		const inbound = towards(here, corners[(i - 1 + sides) % sides], cut);
		const outbound = towards(here, corners[(i + 1) % sides], cut);
		parts.push(`${i ? "L" : "M"}${n2(inbound[0])} ${n2(inbound[1])}Q${n2(here[0])} ${n2(here[1])} ${n2(outbound[0])} ${n2(outbound[1])}`);
	}

	return `${parts.join("")}Z`;
}

function teardrop(rx: number, ry: number, tip: number): string {
	const nose = 0.86;
	const t = Math.max(1.05, tip);
	const tx = rx * Math.sqrt(1 - 1 / (t * t));
	const ty = -ry / t;
	const apex = -t * ry;
	const ax = tx * (1 - nose);
	const ay = ty + (apex - ty) * nose;

	return `M${n2(-tx)} ${n2(ty)}A${n2(rx)} ${n2(ry)} 0 1 0 ${n2(tx)} ${n2(ty)}L${n2(ax)} ${n2(ay)}Q0 ${n2(apex)} ${n2(-ax)} ${n2(ay)}Z`;
}

interface Shape {
	faceY: number;
	faceR: number;
	spin: number;
	body: () => string;
}

const SHAPES: Shape[] = [
	{ faceY: 0, faceR: 1, spin: 0, body: () => superellipse(R, R, 2) },
	{ faceY: 0.04, faceR: 0.7, spin: 0, body: () => teardrop(R * 0.84, R * 0.76, 1.5) },
	{ faceY: -0.02, faceR: 0.92, spin: -14, body: () => superellipse(R * 1.03, R * 0.9, 2.7) },
	{ faceY: 0, faceR: 0.98, spin: 0, body: () => superellipse(R, R, 4.2) },
	{ faceY: 0.26, faceR: 0.5, spin: 0, body: () => polygon(R * 1.18, R * 1.08, 3, 0.52, -90) },
	{ faceY: 0.02, faceR: 0.7, spin: 0, body: () => polygon(R, R, 4, 0.55, -90) },
	{ faceY: 0, faceR: 0.84, spin: 0, body: () => polygon(R, R, 6, 0.38, -90) },
	{ faceY: 0.02, faceR: 0.8, spin: 0, body: () => superellipse(R * 0.82, R, 2.6) },
];

const PATHS = new Map<Shape, string>();

function bodyPath(shape: Shape): string {
	const known = PATHS.get(shape);
	if (known) {
		return known;
	}

	const path = shape.body();
	PATHS.set(shape, path);
	return path;
}

interface Mood {
	eyeWidth: number;
	eyeHeight: number;
	blinkMin: number;
	blinkSpread: number;
}

const MOODS: Record<State, Mood> = {
	idle: { eyeWidth: 5, eyeHeight: 11, blinkMin: 2200, blinkSpread: 4000 },
	working: { eyeWidth: 5, eyeHeight: 8.5, blinkMin: 900, blinkSpread: 1400 },
	waiting: { eyeWidth: 5.6, eyeHeight: 12, blinkMin: 3000, blinkSpread: 5000 },
	failed: { eyeWidth: 5, eyeHeight: 8, blinkMin: 2600, blinkSpread: 4000 },
};

export type Look = "pointer" | "sidebar" | "still";

interface Eye {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	rot: number;
	depth: number;
}

function eyeFrame(side: number, yaw: number, pitch: number, mood: Mood, faceR: number): Eye {
	const lon = rad(yaw) + rad(SEP) * side;
	const lat = rad(pitch) + rad(RISE);
	const depth = Math.cos(lat) * Math.cos(lon);
	const reach = R * faceR * BULGE;

	return {
		cx: reach * Math.cos(lat) * Math.sin(lon),
		cy: -reach * Math.sin(lat),
		rx: mood.eyeWidth * faceR * clamp(depth, 0, 1) ** FORE,
		ry: mood.eyeHeight * faceR * (0.35 + 0.65 * Math.cos(lat)),
		rot: TILT * deg(Math.atan2(-Math.sin(lat) * Math.sin(lon), Math.cos(lat))),
		depth,
	};
}

let ids = 0;

const pointer = { x: 0, y: 0, seen: false };
let sidebarHot = false;

export function watchSidebar(element: HTMLElement): () => void {
	const enter = () => {
		sidebarHot = true;
	};
	const leave = () => {
		sidebarHot = false;
	};

	element.addEventListener("pointerenter", enter);
	element.addEventListener("pointerleave", leave);

	return () => {
		element.removeEventListener("pointerenter", enter);
		element.removeEventListener("pointerleave", leave);
		sidebarHot = false;
	};
}

interface Pose {
	yaw: number;
	pitch: number;
	vyaw: number;
	vpitch: number;
	lid: number;
	nextBlink: number;
}

interface Rig {
	svg: SVGSVGElement;
	body: SVGPathElement;
	pupils: [SVGRectElement, SVGRectElement];
	clipShape: SVGPathElement;
	shape: Shape;
	seed: number;
	pose: Pose;
	rect: DOMRect | null;
}

const poses = new WeakMap<SVGSVGElement, Pose>();

const STATES: State[] = ["idle", "working", "waiting", "failed"];
const LOOKS: Look[] = ["pointer", "sidebar", "still"];

function moodOf(rig: Rig): Mood {
	return MOODS[STATES.find((state) => state === rig.svg.dataset.state) ?? "idle"];
}

function lookOf(rig: Rig): Look {
	return LOOKS.find((look) => look === rig.svg.dataset.look) ?? "still";
}

const NS = "http://www.w3.org/2000/svg";

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
	const element = document.createElementNS(NS, tag);
	for (const [key, value] of Object.entries(attrs)) {
		element.setAttribute(key, value);
	}
	return element;
}

const rigs = new Set<Rig>();
let frame: number | null = null;
let last = 0;

function still(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function tracking(look: Look): boolean {
	if (look === "sidebar") {
		return sidebarHot;
	}

	return look === "pointer";
}

function target(rig: Rig, clock: number): [number, number] {
	if (rig.svg.dataset.state === "working") {
		const t = clock + rig.seed * 23;
		const sweep = Math.sin(t * 0.9) * 0.62 + Math.sin(t * 2.17 + 1.1) * 0.24;
		const dip = Math.sin(t * 0.63 + 0.7) * 0.3 - 0.45;
		return [sweep * YAW, dip * DOWN];
	}

	if (!tracking(lookOf(rig)) || !pointer.seen || !rig.rect?.width) {
		const t = clock * 0.11 + rig.seed * 17;
		const wander = Math.sin(t) * 0.5 + Math.sin(t * 0.37 + 1.7) * 0.3;
		return [wander * YAW * 0.45, Math.sin(t * 0.29 + 2.4) * DOWN * 0.2];
	}

	const dx = pointer.x - (rig.rect.left + rig.rect.width / 2);
	const dy = rig.rect.top + rig.rect.height / 2 - pointer.y;
	const away = Math.max(Math.hypot(dx, dy), REACH);

	const lift = dy > 0 ? UP : DOWN;

	return [(dx / away) * YAW, (dy / away) * lift];
}

function draw(rig: Rig): void {
	const mood = moodOf(rig);
	const transform = `rotate(${n2(rig.pose.yaw * LEAN)} 0 ${n2(R * 0.55)}) rotate(${n2(rig.shape.spin)})`;

	rig.body.setAttribute("transform", transform);
	rig.clipShape.setAttribute("transform", transform);

	for (const [index, side] of [-1, 1].entries()) {
		const eye = eyeFrame(side, rig.pose.yaw, rig.pose.pitch, mood, rig.shape.faceR);
		const pupil = rig.pupils[index];

		if (eye.depth <= 0.02) {
			pupil.setAttribute("display", "none");
			continue;
		}

		pupil.removeAttribute("display");
		const width = Math.max(0.6, eye.rx * 2);
		const height = Math.max(0.6, eye.ry * 2 * rig.pose.lid);
		pupil.setAttribute("x", n2(-width / 2));
		pupil.setAttribute("y", n2(-height / 2));
		pupil.setAttribute("width", n2(width));
		pupil.setAttribute("height", n2(height));
		pupil.setAttribute("rx", n2(Math.min(width, height) / 2));
		pupil.setAttribute("transform", `translate(${n2(eye.cx)} ${n2(eye.cy + rig.shape.faceY * R)}) rotate(${n2(eye.rot)})`);
	}
}

function tick(now: number): void {
	const dt = Math.min(0.05, (now - last) / 1000);
	last = now;
	const clock = now / 1000;

	for (const rig of rigs) {
		rig.rect = rig.svg.getBoundingClientRect();
	}

	for (const rig of rigs) {
		const mood = moodOf(rig);
		const [tx, ty] = target(rig, clock);
		const stiff = rig.svg.dataset.state === "working" ? WORK_STIFF : STIFF;

		rig.pose.vyaw += (tx - rig.pose.yaw) * stiff * dt - rig.pose.vyaw * DAMP * dt;
		rig.pose.vpitch += (ty - rig.pose.pitch) * stiff * dt - rig.pose.vpitch * DAMP * dt;
		rig.pose.yaw += rig.pose.vyaw * dt;
		rig.pose.pitch += rig.pose.vpitch * dt;

		rig.pose.nextBlink -= dt * 1000;
		if (rig.pose.nextBlink <= 0) {
			rig.pose.nextBlink = mood.blinkMin + Math.random() * mood.blinkSpread;
			rig.pose.lid = 0.08;
		}
		rig.pose.lid += (1 - rig.pose.lid) * Math.min(1, dt * LID_SPEED);
	}

	for (const rig of rigs) {
		draw(rig);
	}

	frame = requestAnimationFrame(tick);
}

function run(): void {
	if (frame !== null || rigs.size === 0 || still()) {
		return;
	}

	last = performance.now();
	frame = requestAnimationFrame(tick);
}

function halt(): void {
	if (frame === null || rigs.size > 0) {
		return;
	}

	cancelAnimationFrame(frame);
	frame = null;
}

let listening = false;

function listen(): void {
	if (listening) {
		return;
	}

	listening = true;
	window.addEventListener(
		"pointermove",
		(event) => {
			pointer.x = event.clientX;
			pointer.y = event.clientY;
			pointer.seen = true;
		},
		{ passive: true },
	);
	document.addEventListener(
		"pointerleave",
		() => {
			pointer.seen = false;
		},
		{ passive: true },
	);
}

export function mountFace(svg: SVGSVGElement, name: string): () => void {
	const t = traits(name);
	const colors = palette(t.num("hue", 0, 360), true, t("tone"));
	const shape = SHAPES[t.int("mimo.shape", 0, SHAPES.length - 1)];
	const path = bodyPath(shape);
	const id = `face-${(ids += 1)}`;

	svg.setAttribute("viewBox", "-64 -64 128 128");
	svg.replaceChildren();

	const clipShape = node("path", { d: path });
	const clip = node("clipPath", { id });
	clip.append(clipShape);
	const defs = node("defs", {});
	defs.append(clip);

	const body = node("path", { d: path, fill: colors.head ?? "currentColor" });
	const eyes = node("g", { fill: colors.eye ?? "#14110f", "clip-path": `url(#${id})` });
	const pupils: [SVGRectElement, SVGRectElement] = [node("rect", {}), node("rect", {})];
	eyes.append(...pupils);
	svg.append(defs, body, eyes);

	const pose = poses.get(svg) ?? { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, lid: 1, nextBlink: 900 + t("mimo.phase") * 3000 };
	poses.set(svg, pose);

	const rig: Rig = { svg, body, clipShape, pupils, shape, seed: t("mimo.phase"), pose, rect: null };

	draw(rig);
	rigs.add(rig);
	listen();
	run();

	const watch = new MutationObserver(() => {
		if (frame === null) {
			draw(rig);
		}
	});
	watch.observe(svg, { attributeFilter: ["data-state"] });

	return () => {
		watch.disconnect();
		rigs.delete(rig);
		halt();
	};
}
