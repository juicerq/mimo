import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { JevFailure } from "@src/shared/jev"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Field, fieldControlClassName } from "../ui/field"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"

const failures: Record<JevFailure, string> = {
  rejected: "A TypeSafe recusou a chave. Confira o acesso ou substitua a chave.",
  limited: "O limite de uso ou saldo da TypeSafe foi atingido. Confira sua conta e verifique novamente.",
  unavailable: "A TypeSafe não respondeu a tempo. A chave foi mantida; tente verificar novamente.",
  invalid_response: "A resposta da TypeSafe não passou na verificação. Tente novamente.",
  cancelled: "Verificação interrompida.",
  not_configured: "Insira uma chave para habilitar o Jev.",
}

export function JevSettings({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const keyInput = useRef<HTMLInputElement>(null)
  const [replacing, setReplacing] = useState(false)
  const [result, setResult] = useState<string>()
  const options = client.query.jev.status.queryOptions({ refetchInterval: 15_000 })
  const { data, error, isPending } = useQuery(options)
  const { mutate, isPending: saving, error: mutationError } = useMutation({
    mutationFn: async (action: "save" | "verify" | "remove") => {
      setResult(undefined)

      if (action === "remove") {
        await client.raw.jev.remove()
        setReplacing(false)
        setResult("Chave removida. O navegador convencional continua disponível.")
        return
      }

      const key = keyInput.current?.value.trim()

      if (keyInput.current) {
        keyInput.current.value = ""
      }

      const response = action === "save" && key ? await client.raw.jev.save({ key }) : await client.raw.jev.verify()
      setReplacing(false)
      setResult(response.ok ? `Conexão verificada com ${response.verification.model}.` : failures[response.reason])
    },
    onSettled: async () => { await queryClient.invalidateQueries({ queryKey: options.queryKey }) },
  })
  const failure = error ?? mutationError
  const editing = !data?.configured || replacing

  return (
    <SettingsSection title="Navegação">
      <form className={`${settingsPanelClassName} flex flex-col gap-4`} onSubmit={(event) => { event.preventDefault(); mutate("save") }}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="m-0 text-control font-medium text-primary">Navegar com Jev</h4>
            <span className="text-metadata font-medium text-muted">{data?.configured ? "Chave configurada" : "Não configurado"}</span>
          </div>
          <p className="m-0 mt-1 text-support text-secondary">Jev, da TypeSafe, escolhe os próximos passos em tarefas curtas no navegador dos Bots.</p>
        </div>
        {editing && <Field label="Chave de API do Jev">
          <input ref={keyInput} className={fieldControlClassName} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Cole sua chave de API" aria-describedby="jev-data-use" required disabled={saving || isPending || !!error} />
        </Field>}
        <p id="jev-data-use" className="m-0 text-support text-secondary">O Jev recebe da página os nomes dos elementos e o contexto necessário à tarefa. Senhas e a chave ficam fora desse conteúdo. Salvar e verificar faz uma consulta de teste à TypeSafe.</p>
        <div className="flex flex-wrap gap-2">
          {editing
            ? <Button type="submit" disabled={saving || isPending || !!error}>{saving ? "Verificando..." : "Salvar e verificar"}</Button>
            : <>
                <Button type="button" disabled={saving} onClick={() => mutate("verify")}>{saving ? "Verificando..." : "Verificar conexão"}</Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => { setReplacing(true); setResult(undefined) }}>Substituir</Button>
              </>}
          {data?.configured && <Button type="button" variant="text" disabled={saving} onClick={() => mutate("remove")}>Remover</Button>}
          {replacing && <Button type="button" variant="text" disabled={saving} onClick={() => setReplacing(false)}>Cancelar</Button>}
        </div>
        {isPending && <p className="m-0 text-support text-muted">Carregando configuração...</p>}
        {result && <p className="m-0 text-support text-secondary" role="status">{result}</p>}
        {data?.verification && <p className="m-0 text-metadata text-muted">Verificado: {data.verification.model} · {data.verification.inputTokens} tokens de entrada · {data.verification.outputTokens} de saída</p>}
        {data?.configured && !data.verification && <p className="m-0 text-support text-muted">Chave salva. Verifique a conexão para habilitar a navegação com Jev.</p>}
        {failure && <p className="m-0 text-support text-status-error" role="alert">Não foi possível atualizar a configuração. Tente novamente.</p>}
      </form>
    </SettingsSection>
  )
}
