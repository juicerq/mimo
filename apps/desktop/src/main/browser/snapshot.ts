import { z } from "zod";

const HOT = new Set(["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "tab", "menuitem", "option", "switch", "slider", "spinbutton"]);
const MUTE = new Set([
	"none",
	"presentation",
	"generic",
	"InlineTextBox",
	"LineBreak",
	"IframePresentational",
	"LayoutTable",
	"LayoutTableRow",
	"LayoutTableCell",
	"Iframe",
	"Pre",
	"EmphasizedText",
	"StrongText",
]);
const NAME_LIMIT = 160;
const VALUE_LIMIT = 80;
const SNAPSHOT_LIMIT = 20_000;
const CUT = "\n\n[A página é maior que isto. Os elementos com ref estão todos aqui; parte do texto ficou de fora.]";

const Property = z.object({ value: z.unknown() });

const Node = z.looseObject({
	nodeId: z.string(),
	parentId: z.string().optional(),
	childIds: z.array(z.string()).default([]),
	backendDOMNodeId: z.number().optional(),
	ignored: z.boolean().default(false),
	role: Property.optional(),
	name: Property.optional(),
	value: Property.optional(),
});

const Tree = z.object({ nodes: z.array(Node) });

type AxNode = z.output<typeof Node>;

interface Line {
	text: string;
	acts: boolean;
}

function words(property: z.output<typeof Property> | undefined, limit: number): string {
	if (typeof property?.value !== "string") {
		return "";
	}
	return property.value.replaceAll(/\s+/gu, " ").trim().slice(0, limit);
}

function describe(node: AxNode, depth: number): Line | null {
	const role = words(node.role, NAME_LIMIT);
	const name = words(node.name, NAME_LIMIT);
	const acts = HOT.has(role) && node.backendDOMNodeId !== undefined;
	if (node.ignored || MUTE.has(role) || (!acts && !name)) {
		return null;
	}
	const indent = "  ".repeat(depth);
	const label = role === "StaticText" ? `text: ${name}` : `${role}${name ? ` "${name}"` : ""}`;
	const ref = acts ? ` [ref=e${String(node.backendDOMNodeId)}]` : "";
	const value = words(node.value, VALUE_LIMIT);
	const shown = value && value !== name ? ` value="${value}"` : "";
	return { text: `${indent}- ${label}${ref}${shown}`, acts };
}

function collect(nodes: AxNode[]): Line[] {
	const byId = new Map(nodes.map((node) => [node.nodeId, node]));
	const lines: Line[] = [];

	function walk(node: AxNode, depth: number, said: string): void {
		const name = words(node.name, NAME_LIMIT);
		const line = name && said.includes(name) ? null : describe(node, depth);
		if (line) {
			lines.push(line);
		}
		for (const id of node.childIds) {
			const child = byId.get(id);
			if (child) {
				walk(child, line ? depth + 1 : depth, line ? name || said : said);
			}
		}
	}

	for (const node of nodes) {
		if (!node.parentId || !byId.has(node.parentId)) {
			walk(node, 0, "");
		}
	}
	return lines;
}

function fit(lines: Line[]): string {
	const whole = lines.map((line) => line.text).join("\n");
	if (whole.length <= SNAPSHOT_LIMIT) {
		return whole;
	}
	const kept: string[] = [];
	let room = SNAPSHOT_LIMIT;
	for (const line of lines) {
		if (!line.acts && line.text.length > room) {
			continue;
		}
		kept.push(line.text);
		room -= line.text.length + 1;
	}
	return `${kept.join("\n")}${CUT}`;
}

export function readSnapshot(tree: unknown): string {
	return fit(collect(Tree.parse(tree).nodes));
}
