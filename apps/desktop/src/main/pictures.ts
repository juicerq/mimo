import { pathToFileURL } from "node:url";
import { imageFile, imageName } from "@agent/images/images";
import { net, protocol } from "electron";

const PICTURE_SCHEME = "mimo-image";

const BOT_ID = /^[0-9a-f-]{36}$/u;

export function claimPictures(): void {
	protocol.registerSchemesAsPrivileged([
		{ scheme: PICTURE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
	]);
}

export function servePictures(): void {
	protocol.handle(PICTURE_SCHEME, async (request) => {
		const url = new URL(request.url);
		const name = url.pathname.slice(1);
		if (!BOT_ID.test(url.hostname) || !imageName(name)) {
			return new Response("", { status: 404 });
		}
		return await net.fetch(pathToFileURL(imageFile(url.hostname, name)).toString());
	});
}
