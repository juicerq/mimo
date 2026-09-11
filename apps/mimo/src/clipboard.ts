const COMMANDS = [
	["wl-copy"],
	["xclip", "-selection", "clipboard"],
	["xsel", "--clipboard", "--input"],
	["pbcopy"],
];

async function runCommand(command: string[], text: string): Promise<boolean> {
	const [name, ...args] = command;
	if (!name || !Bun.which(name)) {
		return false;
	}
	const copier = Bun.spawn([name, ...args], {
		stdin: new TextEncoder().encode(text),
		stdout: "ignore",
		stderr: "ignore",
	});
	return await copier.exited === 0;
}

export async function copyToClipboard(text: string): Promise<void> {
	for (const command of COMMANDS) {
		if (await runCommand(command, text).catch(() => false)) {
			return;
		}
	}
	const payload = Buffer.from(text, "utf8").toString("base64");
	process.stdout.write(`\u001b]52;c;${payload}\u0007`);
}
