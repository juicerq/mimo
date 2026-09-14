import { TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ProjectGroups } from "@src/shared/projects"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"

export function ProjectRemovalDialog({ project, client, onClose }: { project: ProjectGroups["projects"][number]; client: EngineClient; onClose: () => void }) {
  const queryClient = useQueryClient()
  const botCount = project.bots.reduce((total, bot) => total + 1 + bot.members.length, 0)
  const { mutate: remove, isPending: removing, error } = useMutation(client.query.projects.remove.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      onClose()
    },
  }))

  return <ConfirmationDialog icon={<TrashIcon />} title="Excluir Projeto" onClose={() => !removing && onClose()} actions={<>
    <Button variant="text" type="button" autoFocus disabled={removing} onClick={onClose}>Cancelar</Button>
    <Button variant="danger" type="button" disabled={removing} onClick={() => remove({ id: project.id })}>{removing ? "Excluindo..." : "Excluir Projeto"}</Button>
  </>}>
    <p className="m-0 text-control text-secondary">Excluir {project.name} remove apenas o agrupamento. Não é possível desfazer.</p>
    {botCount > 0 && <p className="m-0 text-control text-secondary">{botCount === 1 ? "O Bot do Projeto continua, sem projeto." : `Os ${botCount} Bots do Projeto continuam, sem projeto.`}{project.defaultWorkingDirectory ? " Quem usava a pasta padrão passa a trabalhar na própria pasta privada." : ""}</p>}
    {error && <p className="m-0 text-support text-status-error" role="alert">Falha ao excluir o Projeto: {error.message}</p>}
  </ConfirmationDialog>
}
