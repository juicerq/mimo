import { ipcRenderer } from "electron";

window.addEventListener("message", (event) => {
	if (event.source === window && event.data === "rpc") {
		ipcRenderer.postMessage("rpc", null, [...event.ports]);
	}
});
