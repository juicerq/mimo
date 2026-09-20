import type { BrowserKey, BrowserView, Direction, Page, Shot } from "@agent/browser/browser";
import { WebContentsView, shell, type BrowserWindow } from "electron";
import { z } from "zod";
import { readSnapshot } from "./snapshot";

const WIDTH = 1280;
const HEIGHT = 800;
const PARKED = { x: 1 - WIDTH, y: 1 - HEIGHT, width: WIDTH, height: HEIGHT };
const TOP_BAR = 56;
const FOOT_BAR = 52;
const PHOTO_WIDTH = 480;
const PHOTO_QUALITY = 70;
const SCROLL_STEP = 700;
const SELECT_ALL = process.platform === "darwin" ? "meta" : "control";
const AFTER_LOAD = 800;
const AFTER_ACT = 400;

const Box = z.object({ model: z.object({ content: z.array(z.number()).min(8) }) });

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function center(content: number[]): { x: number; y: number } {
	return { x: Math.round((content[0] + content[4]) / 2), y: Math.round((content[1] + content[5]) / 2) };
}

function nodeId(ref: string): number {
	const id = Number(ref.slice(1));
	if (!Number.isInteger(id) || id <= 0) {
		throw new Error(`${ref} não é um ref desta página. Use um ref do último look.`);
	}
	return id;
}

export class PageView implements BrowserView {
	private readonly view: WebContentsView;
	private wired = false;

	constructor(private readonly window: BrowserWindow) {
		this.view = new WebContentsView({
			webPreferences: {
				partition: "persist:browser",
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				backgroundThrottling: false,
			},
		});
		this.view.setBounds(PARKED);
		this.window.contentView.addChildView(this.view);
		this.guard();
	}

	async open(url: string): Promise<void> {
		await this.contents.loadURL(url).catch((error: Error) => {
			throw new Error(`A página não abriu: ${error.message}`);
		});
		await this.settle(AFTER_LOAD);
	}

	async read(): Promise<Page> {
		const tree = await this.send("Accessibility.getFullAXTree");
		return { url: this.contents.getURL(), title: this.contents.getTitle(), snapshot: readSnapshot(tree) };
	}

	async click(ref: string): Promise<void> {
		const spot = await this.spot(ref);
		this.contents.sendInputEvent({ type: "mouseMove", ...spot });
		this.contents.sendInputEvent({ type: "mouseDown", ...spot, button: "left", clickCount: 1 });
		this.contents.sendInputEvent({ type: "mouseUp", ...spot, button: "left", clickCount: 1 });
		await this.settle(AFTER_ACT);
	}

	async fill(ref: string, text: string): Promise<void> {
		await this.click(ref);
		this.contents.sendInputEvent({ type: "keyDown", keyCode: "a", modifiers: [SELECT_ALL] });
		this.contents.sendInputEvent({ type: "keyUp", keyCode: "a", modifiers: [SELECT_ALL] });
		await this.contents.insertText(text);
		await this.settle(AFTER_ACT);
	}

	async press(key: BrowserKey): Promise<void> {
		this.contents.sendInputEvent({ type: "keyDown", keyCode: key });
		this.contents.sendInputEvent({ type: "keyUp", keyCode: key });
		await this.settle(AFTER_LOAD);
	}

	async scroll(direction: Direction): Promise<void> {
		await this.send("Input.dispatchMouseEvent", {
			type: "mouseWheel",
			x: Math.round(WIDTH / 2),
			y: Math.round(HEIGHT / 2),
			deltaX: 0,
			deltaY: direction === "down" ? SCROLL_STEP : -SCROLL_STEP,
		});
		await this.settle(AFTER_ACT);
	}

	async shot(): Promise<Shot> {
		const head = { url: this.contents.getURL(), title: this.contents.getTitle() };
		const image = await this.contents.capturePage(undefined, { stayHidden: true }).catch(() => null);
		if (!image || image.isEmpty()) {
			return { ...head, photo: null };
		}
		const jpeg = image.resize({ width: PHOTO_WIDTH }).toJPEG(PHOTO_QUALITY);
		return { ...head, photo: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
	}

	present(open: boolean): void {
		if (!open) {
			this.view.setBounds(PARKED);
			return;
		}
		const { width, height } = this.window.getContentBounds();
		this.view.setBounds({ x: 0, y: TOP_BAR, width, height: Math.max(0, height - TOP_BAR - FOOT_BAR) });
		this.contents.focus();
	}

	close(): void {
		this.window.contentView.removeChildView(this.view);
		this.contents.close();
	}

	private get contents() {
		return this.view.webContents;
	}

	private guard(): void {
		this.contents.setWindowOpenHandler(({ url }) => {
			void this.contents.loadURL(url);
			return { action: "deny" };
		});
		this.contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		this.contents.on("will-navigate", (_event, url) => {
			if (!/^https?:\/\//u.test(url)) {
				_event.preventDefault();
				void shell.openExternal(url);
			}
		});
	}

	private async send(method: string, params?: object): Promise<unknown> {
		if (!this.wired) {
			this.contents.debugger.attach("1.3");
			this.wired = true;
		}
		return await this.contents.debugger.sendCommand(method, params);
	}

	private async spot(ref: string): Promise<{ x: number; y: number }> {
		const backendNodeId = nodeId(ref);
		await this.send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});
		const box = await this.send("DOM.getBoxModel", { backendNodeId }).catch(() => {
			throw new Error(`${ref} já não está na página. Faça um look antes de agir de novo.`);
		});
		return center(Box.parse(box).model.content);
	}

	private async settle(pause: number): Promise<void> {
		if (this.contents.isLoadingMainFrame()) {
			await new Promise<void>((resolve) => this.contents.once("did-stop-loading", () => resolve()));
		}
		await wait(pause);
	}
}
