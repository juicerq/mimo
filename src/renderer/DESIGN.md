---
version: alpha
name: Mimo
description: A calm desktop workspace where Bots feel like capable collaborators and the conversation owns the screen.
colors:
  primary: "#f5f3f1"
  secondary: "#b3adaa"
  muted: "#7d7774"
  accent: "#e7e5e4"
  accent-ink: "#1a1816"
  canvas: "#0c0a09"
  sidebar: "#0c0a09"
  surface: "#151311"
  surface-raised: "#1c1917"
  surface-hover: "#24211f"
  surface-active: "#2d2926"
  outline: "#302c29"
  outline-strong: "#57514d"
  focus: "#d6d3d1"
  success: "#4ade80"
  warning: "#fbbf24"
  error: "#f87171"
  working: "#fbbf24"
  awaiting-decision: "#60a5fa"
  overlay: "rgb(0 0 0 / 72%)"
  inline-code: "#f0ad67"
  syntax-keyword: "#e4a7eb"
  syntax-string: "#b9df8f"
  syntax-number: "#f2b86f"
  syntax-title: "#8dcced"
typography:
  title:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.02em
  section:
    fontFamily: system-ui
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: system-ui
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.65
  control:
    fontFamily: system-ui
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  support:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  metadata:
    fontFamily: system-ui
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: system-ui
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.08em
rounded:
  sm: 8px
  md: 12px
  lg: 18px
  shell: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  sidebar: 286px
  titlebar: 52px
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.secondary}"
    width: "{spacing.sidebar}"
  conversation:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.shell}"
  list-item:
    backgroundColor: transparent
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  list-item-hover:
    backgroundColor: "{colors.surface-hover}"
  list-item-active:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.secondary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  button-active:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.primary}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  input-focus:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.focus}"
  dialog:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  status-available:
    backgroundColor: "{colors.success}"
    size: 7px
  status-working:
    backgroundColor: "{colors.working}"
    size: 7px
  status-waiting:
    backgroundColor: "{colors.warning}"
    size: 7px
  status-awaiting-decision:
    backgroundColor: "{colors.awaiting-decision}"
    size: 7px
  status-error:
    backgroundColor: "{colors.error}"
    size: 7px
  divider:
    backgroundColor: "{colors.outline}"
  control-outline:
    backgroundColor: "{colors.outline-strong}"
  overlay:
    backgroundColor: "{colors.overlay}"
---

# Mimo

## Overview

Mimo is a quiet workspace for working with Bots. It should feel closer to a
private conversation with capable collaborators than to a dashboard for
configuring automation.

The conversation owns the screen. The sidebar answers one question: who can I
talk to? A Bot appears as one person. When that Bot becomes a Leader, three
overlapping avatars reveal the team without turning teams into the product's
main organizing idea.

The signature is this shift from one avatar to three. It explains the product
model without a badge, tree, team switcher, or extra navigation level. Blobatar
gives every Bot a stable face. Color never replaces the avatar as identity.

Bot faces keep their original SVG silhouettes and colors, with eyes enlarged
20% around each eye's center. They breathe gently and blink briefly at uneven
intervals, with timings offset by identity.
Occasional sideways glances move the eyes first, then slightly turn the body.
The farther eye compresses more to suggest a rounded face; long forward-facing
pauses separate the glances. A seeded 25–46 second cycle holds two short glances,
with the eyes leading the body by roughly 125–230ms. Each identity has its own
direction, blink timing, breathing pace, and working rhythm. Work reduces glance
travel to a quarter; waiting and errors ease it to zero over 240ms instead of
snapping the face forward.
Working narrows the eyes into concentration, with small alternating lifts,
elastic compression, and glances toward the work. Seven small amber dots pulse
in sequence within the same footprint as the other status dots, with no solid
yellow dot underneath. Available and completed show one quiet green dot. Waiting
for a decision or response opens the eyes and calls with a brief tilted lift
followed by a long pause while a blue status dot remains visible. Reduced motion
keeps the working cluster visible without pulsing.
Interrupting and error states stop ambient glances and body movement while
keeping the blink. Mobile faces use the same saved status as their row until
a live session status arrives. An error lowers and tilts the eyes into
concern, without anger, shaking, or changing the Bot's color. A visible transition
to completed briefly squints the eyes with a small lift, then returns to rest;
opening an already-completed Bot does not replay it. Faces never follow the
cursor or spin, and use no 3D rendering. The movement scales with the avatar,
so sidebar faces stay quieter than large identities. Motion uses SVG transforms
without changing layout or adding a frame, and is disabled by reduced motion.
Animated SVG roots use `will-change: contents` so Chromium redraws their vector
contents instead of softening the face through cached transform layers.

The interface stays dark, warm, and restrained. Large rounded planes separate
the persistent workspace. Controls stay quiet until the pointer or keyboard
reaches them. The user's message, the Bot's answer, and the prompt are the
strongest elements in that order.

Inline code in conversations uses a strong warm amber and semibold monospace
text without a border or background. Fenced code remains contained in its own
surface with syntax highlighting.

The conversation's top edge uses a 12px translucent fade with a light 6px blur.
It softens clipped content without creating a visible header layer.

Activity steps with multiple targets present one target per line in a nested
disclosure. Completed history opens the list initially, while settled live
steps keep it closed. The disclosure chevron appears only on hover or keyboard
focus, close to the label inside the standard hover surface. Lists add no
border, surface, or spacing between their items.

## Colors

The palette uses warm near-black surfaces and three strengths of neutral text.
The app has no decorative brand color.

- **Primary (#f5f3f1):** Names, headings, message text, and the current value.
  This is the strongest ink and should be spent sparingly outside conversation.
- **Secondary (#b3adaa):** Labels, control text, helper copy, and inactive
  values that still need comfortable reading.
- **Muted (#7d7774):** Timestamps, status copy, placeholders, and section labels.
  Muted text is metadata, never an instruction or a paragraph.
- **Canvas and sidebar (#0c0a09):** The window frame and navigation plane share
  one uninterrupted background. Spacing alone defines the sidebar.
- **Surfaces (#151311 → #2d2926):** `surface` holds the conversation.
  `surface-raised` holds dialogs, the prompt, and selected rows.
  `surface-hover` and `surface-active` belong only to interaction states.
- **Outlines (#302c29, #57514d):** The soft outline separates persistent
  regions. The strong outline belongs to controls and focus-adjacent states.
- **Status colors:** Green means available or complete. Yellow means working or
  interrupting. Red means failure. Blue is reserved for a future state where
  the Bot is waiting for a decision from the user. Each color answers a state
 question. In the sidebar, the avatar itself animates for activity and exposes its
 status text in a top tooltip instead of repeating it in the Bot description.
- **Syntax colors:** Muted lavender, sage, amber, and blue distinguish code
  tokens inside fenced blocks. They never leave code or replace status colors.

Primary, secondary, and muted are the complete ink scale. Adding another gray
creates an unnamed focus level and weakens the hierarchy.

## Typography

Mimo uses the operating system's sans-serif face. The app should feel native on
the computer where it runs, and long conversations need a familiar reading
face. A monospace face is reserved for paths, commands, hashes, and code inside
messages.

Five roles control the hierarchy:

- **Title, 20px:** Dialog titles and a Bot's name in a dedicated detail view.
  A screen gets one title.
- **Section, 15px:** Empty-state headings, compact panel headings, and names
  that anchor a local region.
- **Body, 15px:** Every message and any prose longer than one line. Conversation
  never drops below this size.
- **Control, 13px:** Inputs, buttons, Bot names in the sidebar, and short values.
- **Support, 12px:** Helper text and secondary status. It stays readable at a
  glance but does not compete with the control it explains.
- **Metadata and label, 11px:** Timestamps, terse state text, and uppercase
  region labels. This role never carries a sentence the user must understand.

Primary ink plus size and weight marks the first reading target. Muted ink alone
cannot create hierarchy between two equally sized headings. Weight stays between
400 and 600 so the interface does not alternate between faint and heavy text.

Uppercase belongs only to short region labels such as `BOTS`. Bot names,
actions, form labels, states, and messages use sentence case. Every text block
should survive 100% display scaling without relying on text below 11px.

## Layout

The desktop window has two persistent regions: a 286px sidebar and the fluid
conversation plane. A 12px channel separates them. Window controls sit in the
upper-right corner without reserving height above the conversation, with the
close action centered on the radius center of the conversation plane's corner. Their icons
stay faint at rest and reach full ink on pointer or keyboard intent. A separate
12px strip across the top owns window dragging without covering the search field.

The compact sidebar uses an 80px avatar rail with 4px row padding and an 8px
channel to the conversation. Bot names and statuses appear on
hover and keyboard focus. Project labels, team branches and disclosure controls
keep the grouping visible; search, create, layout, Plugins and Settings use icons.

The sidebar holds the Bot list directly. It does not start with a team picker.
Its top row combines Bot search with one quiet "+" that opens a menu below it
with Novo Bot and Novo Projeto. Selection uses a tonal row, not a leading line,
checkmark, or accent color. Quiet Plugins and Settings rows stay at the bottom,
in that order, while the Bot list scrolls. They use the same tonal active state
as the other sidebar destinations.

The conversation plane runs to the bottom and right window margins. It uses one
24px outer radius and one outline. The message column grows with the window up
to 848px of usable width.
The prompt shares the message column’s 848px maximum usable width and follows
the same horizontal center.

The message list scrolls at the full height of the conversation while the prompt
floats 22px from the bottom. The list ends with clearance equal to the prompt's
current height plus 12px, so an expanding prompt never covers the latest message.
The editor stops growing at 160px and then scrolls internally. New content follows
the end while the reader is within 312px of it. Farther up, the position stays
fixed and a quiet return-to-end button appears above the prompt. Empty, loading,
streaming, interrupted, and failed states keep the same geometry. A state change
must not move the prompt or resize the conversation plane.

Dialogs sit above the complete window, including the sidebar and titlebar. A
dialog has a compact header, one scrollable body, and a footer whose actions stay
visible. Project creation may use steps when all fields do not fit comfortably
inside a 680px-wide dialog. Bot and Integrante creation stay on the conversation
plane.

Creating a Project requires only its name. Pasta padrão is optional and can be
cleared before saving. Without it, each Bot uses its own working directory or
private Bot directory; the copy describes grouping work, not sharing a folder.

Bot settings, Integrantes, Rotinas, Memórias, and the Rotina editor replace the conversation
on that same floating plane. They share one centered 560px column.

Spacing follows 4, 8, 12, 16, 24, 32, and 48px. A label sits 8px from its
control. Related controls sit 12 or 16px apart. Sections use 24 or 32px. Values
outside this scale need a visible alignment reason.

## Mobile

Below 48rem, the conversation fills the viewport. A full Bot list replaces the
sidebar rail; Projects group Leaders and independent Bots, and indented rows
keep Integrantes visibly attached to their Leader. Leader faces retain the
three-avatar signature. Search and the “Precisam de você” filter preserve their
state when returning from a conversation. Previews come from persisted messages,
while live requests and work take precedence over recorded state.

The conversation header has one identity action, opening the Bot's detail page.
A Leader links directly to Integrantes; an Integrante returns to its Leader.
The root back action returns to the Bot list. Detail pages lead to Memórias,
Rotinas, Gatilhos, Integrantes and Configurações, using the existing capabilities
of each Bot. The desktop edge tab does not render on mobile. Browser history
tracks destinations, and reopening the remote app restores the last conversation.

Team updates appear near the latest messages. They link to Integrantes who need
a response, are working, or have messages since the Leader's previous visit.
The header distinguishes a completed Leader response from a Time still waiting
for the person. These are factual status and message previews, not generated
summaries of unseen work.

The composer keeps images, conversation options and send within 44px touch
targets. Its options sheet presents Modelo, Esforço and Permissões. Execution
settings keep the Engine's existing rule: changes require an idle Bot. Stop
remains reachable while writing and asks for confirmation on mobile. The Fila
stays above the composer. On mobile it shows a compact count and preview; opening
it reveals an ordered sheet with message text, image previews and separate 44px
Enviar agora and Remover controls. Desktop keeps two-line previews and visible
actions inline, with the complete Fila available in a dialog. The queue explains
whether it waits for the current response, a decision, reconnection or resumption.
Removing or advancing a message gives feedback; an open, drained queue shows an
empty state.
Interrupting preserves queued messages. Text, mentions, commands and image drafts
persist on this device; storage failures leave the draft in memory and show a
warning. Sending failures restore the draft.

A connection banner communicates reconnection and sending waits for the
connection. Returning from a background tab refreshes the connection and recorded
state. Reading positions survive navigation between conversations during the
session. The available visual viewport controls mobile height, including keyboard
resizes; short viewports bound the editor, attachments and Fila independently.

Dialogs and conversation menus become bottom sheets with the existing surface,
outline, overlay and reduced-motion behavior. Enter breaks the line; the send
action delivers. Touch controls remain visible, tooltips do not open on touch,
and message metadata is available by tapping. Inputs use 16px type to avoid
focus zoom. Headers, composers, lists and sheets respect safe areas.

## Elevation & Depth

Persistent regions use tone and one outline. They do not cast shadows. The
conversation sits one step above the canvas because it holds the work; the
sidebar remains part of the window frame.

Temporary layers use shadow. A dialog combines a short contact shadow with a
wide ambient shadow, both tinted black. Menus and tooltips use the same light
direction with less spread. The overlay darkens the full window enough to leave
the dialog as the only active plane.

Hover states change tone without changing border width. Focus uses a visible
neutral ring. Neither state moves the control or changes the layout.

## Shapes

Large persistent planes use the 24px shell radius. Dialogs use 18px. Rows and
cards use 12px. Inputs and buttons use 8px. A nested shape always uses a smaller
radius than its container.

Circles belong to avatars, status lights, and icon buttons whose hit target is
visibly circular. Pills belong to short status chips.
Text buttons and form fields do not become pills.

## Components

**Bot row.** A 32px Blobatar sits beside two text lines. The first line is the
Bot name in control type and primary ink. The second line shows a clipped work summary in metadata type. Hover and
selection use tone. The row keeps the same outline in every state.

**Leader row.** It has the same anatomy as a Bot row and two disclosure states.
Expanded, it shows only the Leader's 32px Blobatar and reveals the Integrantes
below. Collapsed, it hides the Integrantes and shows the Leader as a 32px Blobatar
centered in front, with up to two 24px Integrantes peeking from behind at the
sides. With one Integrante, the Leader shifts slightly right while the Integrante
peeks from the left. A muted trash action beside Encerrados excludes every closed
member of that team after one confirmation. A separate chevron toggles the team without changing
which Bot conversation is selected. The complete team block owns 8px of space
below it in either state so adjacent teams remain distinct. Expansion combines
a 160ms height transition with a shorter opacity fade and becomes immediate
when reduced motion is requested.

**Conversation.** Bot messages read as plain content on the conversation plane.
User messages use a compact raised bubble aligned right. Messages sit 24px
apart, measured from text to text, and inside a Bot message the activity line
sits 16px above the content. Every block is its own hover target: the activity
line, the Rotina call, the Integrante's result, the Bot's text and the user
bubble. Hovering one shows its author and time in metadata type, stacked with
the name over the time just past the right edge of that block, level with its
last line, or at the left of a user bubble, and they take no space. A block
that opens keeps its stamp beside the chip, not beside the opened body, with
the time sitting on the bottom edge of the hover pill. Activity
lines, the Rotina call and the Integrante's result keep no padding of their
own; the ones that open draw their hover pill outside the box. Their icon
aligns with the left edge of the text. Thinking and tool calls share one
activity history. While a response runs, reasoning and every tool call remain
visible as a progressive stack. The newest activity stays open with its detail;
each earlier activity becomes a compact status line but remains visible. New
activities enter with a short fade and vertical motion. Completed and failed
activities stop moving. Consecutive calls to the same tool form one activity,
such as `Leu 3 arquivos`, with their targets on the supporting line. Separate
reasoning periods remain separate activities with their own durations. Before
the Provider reports an activity, the response uses short contact copy such as
`Contatando Marina…`. It must not describe that waiting period as thinking. The
copy stays stable for the turn and gives way to reasoning or tool activity when
either begins. A completed response collapses the activity history into one
disclosure. Expanding it restores the same chronological sequence instead of
regrouping activities by type. The collapsed line replaces the live stack
instead of appearing beside it. It includes reasoning duration only when the Provider
explicitly reported reasoning; contact and response latency never become
`Pensou` after completion. Its collapsed summary uses a sentence that names
the observed work, such as `Pensou por 5s, leu 3 arquivos e executou 5
comandos.` The duration stays beside reasoning because it does not measure tool
execution. Each live and expanded step uses an icon for its action instead of a
generic completion check. The current step stays on the conversation plane
without a separate background. Expanded history steps hang from the collapsed
summary with the same branching line as grouped team members in the sidebar,
and the final step ends the line. The live stack has no parent above it, so its
steps sit flush with the icon column without a branching line. Only a step's
supporting line keeps a short left border, because it belongs to that step.
Failed and unfinished actions do not count as completed work. Activity details
are a global display preference and start hidden. When hidden, persisted
activity renders nothing. A running turn shows three quiet pulsing dots below
the latest message, without explanatory text or narrated work status.
The dots are removed for a permission request, Plugin request, failure, or completed turn.
Background checks with no meaningful update leave no visible message or notification;
their recorded Activity remains available in the details. A message that renders
nothing occupies no space in the message column. Showing the details
restores the complete live stack and persisted disclosures; hiding never
deletes the recorded Activity.

Provider recovery remains visible even when Activity details are hidden. One
quiet status identifies the provider, with the next attempt on a supporting
line below it. It replaces the working dots during the wait; cancellation
remains in the composer. Intermediate failures belong to
diagnostics, not conversation messages. A final failure preserves prior work
and offers Tentar novamente and Trocar modelo below the latest message; model
selection does not resume work or enable paid usage automatically.

**New Bot.** Creating a Bot happens inside the conversation plane instead of a
dialog. The form shows a 77px Blobatar and one borderless name field on a raised
surface. The single primary action appears after the name has content without
moving the form, and Enter submits it. Success
opens the new conversation immediately. Discarding uses the same collapsible
right-edge action tab as the conversation and Bot settings.

An empty Bot conversation shows the Bot identity and one greeting chosen from
the built-in greeting set. The greeting is presentation, not a persisted
message, because the Bot has not run yet.

**Bot page header.** Every Bot page outside the conversation uses one shared
header: a 64px animated icon, the page title, and the Bot's name in secondary
control type. Settings is a gear, routines an alarm clock, triggers a bolt,
members a group, memory a brain, archive a folder, and details an identity card.
The icons use filled, rounded silhouettes and the Bot's own Blobatar palette,
with the same enlarged eyes, seeded blinks, breathing and sideways glances.
They render without a background, border, frame or activity signal. Reduced
motion stops the animation. Editors and loading or missing-item states retain
the same header. The conversation keeps the Bot's avatar as its identity.

**Bot archive.** Acervo uses the shared page header above a file tree and a
full-height preview. The tree loads folders on expansion, keeps branches open
while selecting files, and scrolls independently from the preview. At least
680px of available desktop content width keeps the preview alongside the tree,
with a 240–384px tree and a 16px gap that grows to 32px at 960px. Narrower
pages open it in a right drawer. Below 48rem the preview always uses a drawer that fills the screen and
respects safe areas. Its header retains the filename, path, view/source toggle
and close action while the content scrolls. Markdown is formatted, HTML renders
in an isolated frame, and images fit within the available area.

**Bot settings.** Editing a Bot is a page on the conversation plane: one
centered 560px column, like New Bot. Blabatars everywhere render without a separate background, border, or frame.
Below the page header come sections labeled in uppercase label type: Função
with labeled name, expected outcome and description fields, Trabalho, Plugins,
then Colegas. Each section places its
content in the same borderless raised panel as App settings. Every field shows
its label. Vínculo shows the Leader as a 32px Blobatar beside its name. Rotinas
and Memória stay in the edge tab instead of appearing again inside Settings.
The form has no footer: while it holds unsaved changes, a bar pinned to the bottom of the plane
names that state on the left and places discard and the single primary action
on the right. It disappears when the draft matches the Bot. The destructive
action sits last, after a divider, as an outlined error-ink button with a trash
icon. Committing it swaps the button for one sentence naming what disappears, a
text cancel, and an outlined error-ink confirm. Closing lives in Conversa on
the edge tab, choosing the Bot in the sidebar, and Escape.

**Bot members.** Integrantes has its own edge-tab page with a group-of-people
icon, available to Bots that are not themselves Integrantes. It reuses the shared
page header and centered column. Criar integrante and Adicionar Bot existente
open forms inside the page, without a dialog. The existing-Bot picker shows
changes to its current team, Project, and incoming Colega links before adding.
Success keeps the Leader selected, updates the members and sidebar, and returns
focus to the action that opened the form. Permanent members appear first;
active temporary members have their own section and closed members stay behind
a disclosure. Member names open their conversations; a settings icon opens
configuration for members that are still active.

**Bot routines.** The Rotinas page reuses the Bot settings shell and shared page
header, then the Rotinas section. A routine has a short name, an expandable instruction
preview, and one semantic schedule summary. Repeated times belong to that
schedule instead of appearing as duplicated rows. Pause, edit, and remove act on
the complete routine. Edit and Nova Rotina open the Rotina page. A secondary
button with a plus icon adds.

**Bot triggers.** The Gatilhos list uses the same shell and row actions as Rotinas: pause, edit, and remove. Edit opens a page with the shared page header, a back action, the name and full instruction, then event conditions. Repositories remain read-only. Event actions use translated toggle chips; less common actions sit under Mais ações. Labels and the switch for events generated by Mimo complete the conditions. Saving uses the existing bottom save bar; discard restores the initial draft, and Escape returns to Gatilhos. Changing the event clears its actions so the person explicitly chooses the new conditions.

**Bot memory.** The Memórias page reuses the same shell. The switch sits in the
section header and a support sentence names the current state. While on, the
section separates active Lembranças into raised groups for what the person
registered and what the Bot learned in conversation. Each group shows its count,
and each row shows the date on the supporting line, a ghost pencil that edits the
text inline, and a ghost trash action. One input with a secondary add button, a
text action to clear that commits the same way as Excluir, and the Leader's
Memória as a quiet block that appears only when the Leader knows something. Off
hides everything but the sentence.
An optional disclosure below the Origem shows the original message supporting the
Lembrança and its date. Editing protects the text and records the person's edit.
A collapsed section shows Lembranças superadas, their supersession date and the
message explaining the change. These remain searchable historical knowledge,
do not count toward the active limit, and can be forgotten but not edited.

**Curation settings.** App settings includes a Memória section with one model
selector grouped by connected Fornecedor. Its default follows each Bot's model.
Supporting copy names what is sent to the selected Fornecedor. Pending Bots and
failures appear below, with a retry action for each affected Bot; an unavailable
saved model remains visible instead of silently selecting another.

**Rotina.** Creating or editing a Rotina is a page on the conversation plane,
not a dialog. It reuses the Bot settings shell and one uppercase Rotina section
with the name, the instruction, and the schedule. The save bar matches Bot
settings: it stays while the new draft is open or the edit differs from the
Rotina, discard restores or leaves, and the single primary action commits.
Escape returns to Rotinas. The edge tab Conversa action and choosing the Bot in
the sidebar return to the conversation.

**App settings.** Settings is a page on the conversation plane with the same
centered 560px column, title anatomy, edge-tab close action, and Escape behavior
as Plugins. Each preference uses one borderless raised row inside its settings
section and saves when changed. Conversation contains the global
switch for showing Activity details; it is off by default and explains that
hidden details remain recorded.

**Edge tab.** The Bot's actions on the conversation plane hide inside a small
tab hugging the plane's right edge at mid-height: a raised half-rounded tongue
with a chevron in muted ink. Pointer hover or keyboard focus unfolds a column of
ghost icon buttons at the edge, so the first action lands under the pointer,
while the chevron slides to the left end and turns toward the edge. Conversa,
Settings, Integrantes, Rotinas, Gatilhos, and Memórias live here. Conversa is always first and is the
chat route. The current page uses the active surface. Choosing Settings,
Integrantes, Rotinas, Gatilhos, or Memórias again returns to the conversation, except on the Rotina
editor, where Rotinas is current and choosing it returns to the list. Choosing
the Bot in the sidebar also returns to the conversation. Nothing sits in the
top-right corner beside the window controls. Favorite Rotinas follow a short
divider as quick calls: a clock with its position, in list order, in a 12px
raised disc at the bottom-right corner, and the Rotina name in the tooltip.
Choosing one calls the Rotina now and opens the conversation; they are disabled
while the Bot works. Each row in Rotinas keeps only a star, which adds or removes
the favorite, and a three-dot menu with Disparar agora, Pausar or Retomar,
Editar, and Remover; right-clicking the row opens the same menu.

**Prompt.** An 18px-radius card centered near the bottom of the conversation.
The field is the strongest control on the screen. Its send action is the only
filled primary action in the normal chat state. Attach, stop, and secondary
actions remain ghost or outlined. A ghost paper clip at the left end attaches
images; pasting or dropping a file on the prompt does the same. Attached images
sit above the text as 48px thumbnails with the 8px radius and the strong
outline, each with a remove
action that appears on hover or keyboard focus. The text sits on its own row
above a bottom row that holds the clip at the left and the send action at the
right. The layout never changes with the text length; the field grows
downward until it scrolls. Send stays
disabled until the draft holds text or an image. The user bubble shows its
images above the text, up to 240px tall, with the same 8px radius. Beside the clip sits
the Permissões chip: a small icon for the mode, `Somente leitura`, `Perguntar`,
or `Acesso total`, in warning ink for `Acesso total`, then the mode's name and
a chevron; below `md` only the icon renders. It opens a menu above itself: a
raised 12px card with the three modes as full-width rows in control type,
secondary ink at rest, hover surface on hover, the active surface with primary
ink for the current mode, and `Perguntar` carrying the quiet `Padrão` badge.
At the right, before the send action, one quiet chip in metadata type names
the Bot's Modelo in secondary ink and its Esforço in muted ink, such as
`GPT-5.6 Luna médio`, and ends in a small chevron. It opens a menu above
itself with a searchable model list and the five Esforço levels always visible
below it. Favorites appear first, followed by models grouped by Fornecedor.
Each model row has a separate star action; favoriting preserves the selected
model and the open menu. Favorites persist on this device and apply to every
Bot, keyed by Fornecedor and model. A drag handle on each favorite changes its
saved order; touch dragging and Alt+ArrowUp or Alt+ArrowDown use the same order.
Reordering preserves the current model and the open panel. Selected models show a check; the Fornecedor
default keeps its quiet `Padrão` badge. The effort control uses five horizontal
radio segments, from baixo to máximo, with the current value above and the
extremes `Mais rápido` and `Mais raciocínio` below. Choosing saves at once and
keeps the panel open so both settings can be adjusted together. Only a
click outside closes it. Dividers span the full panel width, including between
favorites and providers and between provider groups. On mobile, Modelo e esforço share a page in the
conversation options sheet. The Modelo and Esforço chip stays disabled while
the Bot responds. The
Permissões chip remains available, including while awaiting a decision.
When a Bot awaits a decision, a
low-emphasis status card spans the prompt above the draft. It names the
requested action, shows the complete target or command without changing its
whitespace, and ends with the text action `Negar` and the primary action
`Permitir`. Long content scrolls inside the card instead of being shortened.
Further requests remain queued and the card states how many are waiting.

While the draft is a single word that starts with `/`, the Comando menu sits
above the prompt, left-aligned, sharing the anatomy of the Modelo and Esforço
menu: one row per Comando that matches the word, the Comando name in sentence
case without the slash as the row text and what it does in muted metadata
beside it. Arrow keys move the highlighted row, Tab or Enter picks the
Comando, and Escape hides the menu until the text changes.

A picked Comando leaves the text and becomes a chip at the left of the text
row, inside the prompt: the Comando name in metadata type on the hover surface,
one line tall, ending in a small remove icon. The text beside it is the
Comando's argument, and the placeholder names what that argument is. Typing a
Comando in full and following it with a space produces the same chip. Enter or
the send action runs the Comando instead of sending a Mensagem, and running it
clears the prompt. Clicking the chip or pressing Backspace with the caret at
the start of the text removes it and keeps what was typed. Send stays disabled
while the Comando lacks what it needs, such as `lembrar` before any text.

While the Bot responds, the field stays editable and the stop action sits at
the left of the send action, outlined in error ink. Enter puts the draft in the
Fila. Ctrl+Enter, or Ctrl with a click on send, adianta the draft: it reaches
the Bot in the current Turn without stopping the work. While the Bot is waiting
for another Bot's result, Enter sends directly and releases that wait. The work
continues and its result arrives later. The send action remains available without
an explanatory status.

The Fila is a raised 12px card that sits above the prompt in the flow, at the
prompt's width, so the conversation and the return-to-end button move up with
it. A short label in metadata type counts the
messages. Each message is a full-width row in control type: an optional photo
icon with the image count in muted metadata, the text truncated to one line in
secondary ink, and two ghost actions at the right that appear on hover or
keyboard focus, `Enviar agora` and `Remover da fila`. A row with no text reads
`Sem texto` in muted ink. A row being adiantada replaces `Enviar agora` with
`Adiantando…` in muted metadata. When the Bot awaits a decision, a muted line
closes the card: `A entrega espera a sua decisão acima.` The Comando menu and
the Comando status card float over the Fila, because they belong to the draft
and the Fila belongs to what was already sent.

**Dialog.** A fixed header names the task and offers one ghost close action. A
thin progress indicator appears only for a real multi-step flow. The body groups
fields by the decision they ask the user to make. The footer places back or
cancel on the left and the single primary action on the right.

**Bot browser.** The preview opens an expanded, read-only view while the Bot
keeps control. The header identifies the Bot, who has control, and the page URL.
The footer puts the ghost action Voltar ao chat immediately before the primary
Assumir controle action. Taking control pauses the Bot and replaces that primary
action with Passar para the named Bot in the same position. Returning control
keeps the expanded view open for watching; Voltar ao chat only collapses it and
preserves whoever has control. Preview actions say Assistir while the Bot has
control and Abrir while the person has control. Clicking an HTTP(S) link in a
Bot message on desktop opens that Bot’s page in the expanded view with the
person in control. The Bot can take over the current page without another
confirmation; the same header and controls reflect that transfer.

**Form field.** Every field has a visible label in control type. Placeholder
copy gives one realistic example. Helper text uses support type. Validation sits
below the field and says how to correct the value.

**Button.** Primary commits the current flow. Secondary offers a nearby
alternative. Ghost exposes low-frequency actions such as settings, add, close,
and window controls. All variants keep a visible keyboard focus state.
Window controls use the ghost anatomy at reduced rest opacity. Minimize and
maximize use a neutral hover surface. Close introduces error color only on
hover or keyboard focus. Their tooltips open downward to remain inside the
window edge.

**Toggle chip.** A small outlined button that holds a pressed state, such as
one weekday inside a Rotina. Rest uses the strong outline and muted ink.
Pressed uses the focus outline, the active surface, and primary ink. It reports
its state through `aria-pressed` and never replaces a checkbox for a lone option.

**Switch.** A 36×20px pill for one lone on or off option, such as the Memória
of a Bot. Off uses the strong outline, the active surface, and a secondary-ink
thumb. On uses the accent surface with a canvas thumb, the same pairing as the
primary button. It sits at the right end of its row; the text at the left names
the current state in control type and is not a click target. Only the switch
toggles. It reports its state through `role="switch"` and `aria-checked`.

**Empty state.** One section heading explains the state. One support sentence
states the next move. When the next move is already visible nearby, the empty
state does not repeat it as a second button.

## Do's and Don'ts

- Do make the conversation the first reading target. Keep navigation and
  configuration one or two ink levels quieter.
- Do show an expanded Leader as one identity and a collapsed Leader as a stack
  of identities. Keep the row anatomy stable while the team is disclosed.
- Do use one primary action in each state. Let ghost controls wait for intent.
- Do use realistic Bot names, tasks, statuses, and messages when judging a
  screen. Empty placeholders hide hierarchy problems.
- Do keep all five interaction states: rest, hover, focus-visible, active, and
  disabled.
- Do preserve the shell while data loads or a Bot works.
- Don't make teams a required navigation level or a permanent selector.
- Don't use tiny text to fit more controls. Reduce the controls or disclose them
  later.
- Don't add a card around content that grouping and spacing already explain.
- Don't use status colors for selection, branding, or decoration.
- Don't introduce another radius, gray, font size, or component anatomy inside
  a feature. Extend this file and the shared component when the product needs a
  new role.
- Don't copy a Beautiful UI component's styling. Copy its useful interaction
  anatomy, then render it with Mimo tokens and hierarchy.
