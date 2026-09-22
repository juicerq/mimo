const page = Bun.file(new URL("../tests/fixtures/jev-site.html", import.meta.url))
const server = Bun.serve({ hostname: "127.0.0.1", port: 41920, fetch: () => new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }) })
console.log(`Página fictícia do piloto Jev: ${server.url}`)
