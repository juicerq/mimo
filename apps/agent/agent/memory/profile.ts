import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { byPrincipal } from "eve/memory/scope";
import { localMemoryBackend } from "../memory-backend";

export default defineMemory({
	description: "Guarda fatos e preferências duráveis da pessoa entre sessões.",
	// The default namespace hashes the dev-host app root, which changes on every `eve dev`.
	namespace: "mimo",
	provider: fileMemory({ backend: localMemoryBackend() }),
	scope: byPrincipal,
});
