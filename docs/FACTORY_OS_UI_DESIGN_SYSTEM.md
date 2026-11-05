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

## The world (revised 2026-11-05, after client review)

The first build used a "framed sheet" look (mint-grey frame, top bar, Plex Mono codes). The
client found it generic; it was replaced by the frame ERPNext v16 Desk users already know:

- **Two-tier sidebar.** A 56 px icon rail (logo, search, notifications, one icon per module,
  account at the bottom) and a 224 px panel for the open module: the module name with a switcher,
  its pages with icons, and collapsible **Create** and **Reports** sections whose children hang off
  a thin guide line. The current page is a white pill with a hairline shadow. Company, SAMPLE
  badge and the Desk link sit at the foot of the panel. No top bar.
- **Surfaces.** Sidebar `#f8f8f8`, content white, hairlines `#e5e5e5`. Shadows only on the active
  pill and floating layers.
- **Type.** Inter (variable, self-hosted) everywhere, tabular figures for numbers and document
  numbers; no monospace except for code.
- **Colour.** Near-black `#171717` primary buttons; deep mint `#1f6f55` only for links and focus;
  status colours only for status.
- **Status pills.** Rounded pill, dot + label (colour never alone):

  | Tone | Used for |
  |---|---|
  | released (green) | Released, Completed, Paid, Submitted, Accepted, Eligible |
  | hold (amber) | QC Hold, Unpaid, Short dated, Pending |
  | rejected (red) | Rejected, Expired, Cancelled, Overdue |
  | progress (blue) | To Receive, To Deliver, In Process, To Bill, Open |
  | neutral (grey) | Draft, Closed, Planned, Not implemented |

- **SAMPLE.** A dashed amber `SAMPLE` badge beside the company name whenever the company is a
  SAMPLE company; the Command Center repeats "development data, not real".

## Navigation rules

- Modules: Home, Buying, Stock, Manufacturing, Quality, Selling, Accounts, Setup. A module appears
  only if the role can open at least one of its pages; Home and Setup always.
- Every list page has a way to add: a **New** button, or, where the document is made from another
  one (goods receipt, pick list, delivery, invoice, payment), a **start from** picker listing the
  source documents that are ready (`?start=1` opens it, which is what the panel's Create links do).
- Every document page shows **Connections**: the documents before and after it in the flow
  (e.g. a delivery shows its sales orders, pick list, packing slips and invoices), and party,
  batch and document values are links. Documents without a Factory OS page open in Desk.
- Exactly one panel item is active on any page; a panel stays open while it lists the page.
  The end-to-end run checks this for every page of every module for eight roles.

## Components

| Component | Where | Rules |
|---|---|---|
| Shell | `components/Shell.tsx` | icon rail + module panel from `nav.ts` (`MODULES`), filtered by permission; phone: drawer with both |
| Start-from picker | `SourcePicker` (doc.tsx) | side sheet listing source documents ready for the next step; one click runs the ERPNext mapping |
| Connections | `Connections` (doc.tsx) | linked documents with counts, cancelled ones struck through |
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

Top bars that duplicate the sidebar, monospace as decoration, gradients, glass, big rounded cards, decorative shadows, hero metrics, sparklines, emoji icons,
eyebrow labels above headings, invented figures, chat-first layouts, fake "Connect" buttons.
