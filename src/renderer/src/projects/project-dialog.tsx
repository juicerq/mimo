import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Project } from "@src/shared/projects"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogActions, DialogBody } from "../ui/dialog"
import { DirectoryPicker, useDirectoryChooser } from "../ui/directory-picker"
import { Field, fieldControlClassName } from "../ui/field"

/** Creates a Projeto, or edits `project` when given. */
export function ProjectDialog({ client, project, onClose }: { client: EngineClient; project?: Project; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(project?.name ?? "")
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState(project?.defaultWorkingDirectory ?? "")
  const directory = useDirectoryChooser(setDefaultWorkingDirectory)
  const options = {
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      onClose()
    },
  }
  const create = useMutation(client.query.projects.create.mutationOptions(options))
  const update = useMutation(client.query.projects.update.mutationOptions(options))
  const isPending = create.isPending || update.isPending
  const error = create.error ?? update.error
  const projectName = name.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!projectName || isPending) {
      return
    }

    if (project) {
      update.mutate({ id: project.id, name: projectName, defaultWorkingDirectory: defaultWorkingDirectory || null })

      return
    }

    create.mutate({ name: projectName, ...(defaultWorkingDirectory ? { defaultWorkingDirectory } : {}) })
  }

  const copy = project
    ? { eyebrow: "Editar Projeto", title: project.name, failure: "Falha ao salvar o Projeto", submit: "Salvar", submitting: "Salvando..." }
    : { eyebrow: "Novo Projeto", title: "Organize seus Bots", failure: "Falha ao criar o Projeto", submit: "Criar Projeto", submitting: "Criando..." }

  return (
    <Dialog eyebrow={copy.eyebrow} title={copy.title} onClose={onClose}>
      <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
        <DialogBody>
          <Field label="Nome"><input className={fieldControlClassName} autoFocus required placeholder="Ex: Mimo" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Pasta padrão" optional as="div">
            <DirectoryPicker value={defaultWorkingDirectory} placeholder="Escolher pasta" onChoose={directory.choose} onClear={() => setDefaultWorkingDirectory("")} />
            <small className="text-support font-normal text-secondary">Usada pelos Bots que não têm uma pasta própria.</small>
          </Field>
          {directory.error && <p className="text-support text-status-error">Falha ao escolher a pasta: {directory.error}</p>}
          {error && <p className="text-support text-status-error">{copy.failure}: {error.message}</p>}
        </DialogBody>
        <DialogActions>
          <Button variant="text" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isPending || !projectName}>{isPending ? copy.submitting : copy.submit}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
