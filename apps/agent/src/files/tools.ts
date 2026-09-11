import { z } from "zod";
import { tool } from "../tools/tool";
import { listFiles, readFileLines, searchFiles, writeFile } from "./files";

const pathField = z.string().min(1).describe("Caminho absoluto, com ~ para a pasta pessoal, ou relativo a ela.");

export function fileTools() {
	return [
		tool({
			name: "list_files",
			description: "Lista os arquivos e as pastas de um diretório do computador da pessoa. Use para descobrir onde as coisas estão antes de ler.",
			input: z.object({ path: pathField }),
			async execute({ path }) {
				return await listFiles(path);
			},
		}),
		tool({
			name: "read_file",
			description: "Lê um arquivo de texto do computador da pessoa. Devolve no máximo 20 mil caracteres; use from e limit para ler o resto.",
			input: z.object({
				path: pathField,
				from: z.number().int().min(1).default(1).describe("Primeira linha a ler."),
				limit: z.number().int().min(1).nullable().default(null).describe("Quantidade de linhas, ou null para ir até o fim."),
			}),
			async execute({ path, from, limit }) {
				return await readFileLines(path, from, limit);
			},
		}),
		tool({
			name: "search_files",
			description: "Procura um texto nos arquivos de uma pasta do computador da pessoa e devolve arquivo, linha e trecho. Use para achar onde algo está definido.",
			input: z.object({ query: z.string().min(1).describe("O texto a procurar."), path: pathField }),
			async execute({ query, path }) {
				return await searchFiles(query, path);
			},
		}),
		tool({
			name: "write_file",
			description: "Grava um arquivo de texto no computador da pessoa, criando as pastas necessárias e substituindo o conteúdo anterior. No modo normal, a chamada espera aprovação no terminal.",
			input: z.object({ path: pathField, content: z.string().describe("O conteúdo completo do arquivo.") }),
			async execute({ path, content }) {
				return await writeFile(path, content);
			},
		}),
	];
}
