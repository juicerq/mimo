import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { byPrincipal } from "eve/memory/scope";
import { localMemoryBackend } from "../memory-backend";

export default defineMemory({
	description: "Guarda fatos e preferências duráveis da pessoa entre sessões.",
	namespace: "mimo",
	provider: fileMemory({ backend: localMemoryBackend() }),
	scope: byPrincipal,
});
