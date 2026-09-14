export function animateBotPlacement(element: HTMLElement, from: Pick<DOMRect, "left" | "top">, landed: boolean) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return
  }

  const to = element.getBoundingClientRect()
  const isProject = element.hasAttribute("data-project-drop")
  const settle = isProject
    ? { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    : { duration: 280, easing: "cubic-bezier(0.175, 0.885, 0.32, 1.275)" }
  element.animate([
    { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` },
    { transform: "translate(0, 0)" },
  ], settle)

  if (landed && !isProject) {
    element.querySelectorAll<HTMLElement>(".bot-face").forEach((face) => face.animate([
      { transform: "scale(1.08, .9) rotate(-5deg)" },
      { transform: "scale(.94, 1.1) rotate(3deg)", offset: .45 },
      { transform: "scale(1) rotate(0deg)" },
    ], settle))
  }
}
