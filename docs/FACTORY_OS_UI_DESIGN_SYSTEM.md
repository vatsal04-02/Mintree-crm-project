# Factory OS — UI design system

Mode: **Operate** (people complete department tasks). The incumbent visual world of `apps/web`
was kept and extended (decision with the client, 2026-11-05). Source of truth for values:
`apps/web/src/styles/tokens.css`; components: `apps/web/src/styles/app.css` and
`components.css`.

## Principles

1. The ERP decides; the screen asks. A refusal is shown in the server's words, with its title.
2. Only what works is shown. Menus, buttons and figures appear only when the backend behind them
   exists and the role may use it. Not-built work is listed as not built, never simulated.
3. One job per screen, in the department's language (batch, QC Hold, work order, LR / AWB).
4. Every number names its source: report pages state the report and the time it ran; Command
   Center rows name the DocType and filter behind each count.
5. Shop floor is not the office: tablet density (44 px rows and controls), large targets.

## The world

- **Framed sheet.** A mint-grey frame (`--frame`) holds the sidebar and 48 px top bar; work sits on
  one white sheet (`--sheet`) inset 8 px with a 1 px edge and 10 px radius. No shadows except
  floating layers (menus, popovers, palette, toasts, drawer).
- **Type.** IBM Plex Sans for everything; IBM Plex Mono only for codes and document numbers
  (batch, item code, PO/DN/SI numbers, LR numbers) — never as decoration. Tabular numerals
  throughout. Scale: 20 title / 15 section / 14 body / 13 table / 12 small.
- **Colour.** Neutral greys carry the interface; one accent, deep mint `#1f6f55`, marks primary
  actions, focus, the active tab and selection. Status colours are reserved for status.
- **Status chips.** Colour + icon + label, never colour alone:

  | Tone | Used for | Icon |
  |---|---|---|
  | released (green) | Released, Completed, Paid, Submitted, Accepted, Eligible | check-circle |
  | hold (amber) | QC Hold, Unpaid, Short dated, Pending | pause-circle |
  | rejected (red) | Rejected, Expired, Cancelled, Overdue | x-circle |
  | progress (blue) | To Receive, To Deliver, In Process, To Bill | clock |
  | neutral (grey) | Draft, Closed, Planned, Not implemented | dashed circle |

- **SAMPLE.** A dashed amber `SAMPLE` badge sits beside the product name whenever the company is a
  SAMPLE company; the Command Center repeats "development data, not real".

## Components

| Component | Where | Rules |
|---|---|---|
| Shell | `components/Shell.tsx` | sidebar groups from `nav.ts`, filtered by permission; phone: drawer |
| Page header | `PageHeader` | breadcrumb, title (document number in mono + status chip), meta, actions right |
| Panel | `Panel` | 1 px border, 6 px radius, no shadow; never nested in another panel |
| Facts | `Facts` | auto-fill grid of label / value; dashes for empty |
| Data table | `DataTable` | sticky header, hairline rules, no zebra, sortable headers, keyboard-openable rows, flat skeleton rows while loading, empty state that names the tab |
| Report view | `ReportView` | the server's columns and rows as returned; formats by field type; states report name and run time; row filter |
| Fields | `components/fields.tsx` | Link fields search the ERP and accept only a suggested value; required marked with a red asterisk; hints under the field |
| Rows editor | `RowsEditor` | item rows of an unsaved document; numbered; remove per row |
| Notes | `Note`, `ErrorNote` | neutral info, amber hold warnings, red server refusals with the server's title |
| Tabs / segmented control | lists, Stock by QC Status | accent underline for tabs; segmented pressed state on white |
| Toasts | sonner, unstyled + `.toast` | confirm what the server did ("… received into QC Hold") |

## Density

`data-density="compact"` (office, default): 32 px rows and controls. `comfortable` (tablet):
44 px. Controls never go below 36 px tall in either mode.

## Browser surfaces

Selection uses the accent tint; focus is a 2 px accent ring offset from the sheet; scrollbars and
the text caret take palette colours; numerals are tabular everywhere.

## Do not

Gradients, glass, big rounded cards, decorative shadows, hero metrics, sparklines, emoji icons,
eyebrow labels above headings, invented figures, chat-first layouts, fake "Connect" buttons.
