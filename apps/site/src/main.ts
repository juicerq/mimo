import { mountFace } from "@renderer/face";

for (const svg of document.querySelectorAll<SVGSVGElement>("svg[data-face]")) {
	mountFace(svg, svg.dataset.face ?? "mimo");
}

const face = document.querySelector<SVGSVGElement>("#face");
const input = document.querySelector<HTMLInputElement>("#name");
const caption = document.querySelector<HTMLElement>("#caption");

if (!face || !input || !caption) {
	throw new Error("hero markup is missing");
}

const show = () => {
	const name = input.value.trim() || "mimo";

	caption.textContent = name;
	return mountFace(face, name);
};

let unmount = show();

input.addEventListener("input", () => {
	unmount();
	unmount = show();
});
