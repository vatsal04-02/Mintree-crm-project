/**
 * The only way this app talks to the backend: Frappe's REST API and ERPNext's own whitelisted
 * methods, on the same origin, with the Frappe session cookie and this session's CSRF token.
 * No business rule lives here; the server validates every write and its message is shown as is.
 */

export type Doc = { name: string; doctype: string; docstatus: 0 | 1 | 2; [field: string]: unknown };
export type Row = Record<string, unknown>;
export type Filters = Record<string, unknown> | unknown[][];

let csrfToken = "";
export function setCsrfToken(token: string) {
  csrfToken = token;
}

/** A refusal or failure from the server, in the server's own words. */
export class FrappeError extends Error {
  status: number;
  excType?: string;
  /** the server's own title for the message, e.g. "Approval required" */
  title?: string;
  constructor(message: string, status: number, excType?: string, title?: string) {
    super(message);
    this.name = "FrappeError";
    this.status = status;
    this.excType = excType;
    this.title = title;
  }
  get isAuth() {
    return this.status === 401 || (this.status === 403 && this.excType === "AuthenticationError");
  }
  get isPermission() {
    return this.status === 403 || this.excType === "PermissionError";
  }
}

/** Text of a server message. DOMParser builds an inert document: no handlers or scripts run. */
function stripHtml(s: string): string {
  return (new DOMParser().parseFromString(s, "text/html").body.textContent ?? "").trim();
}

/** Frappe puts user-facing messages in _server_messages (a JSON list of JSON objects). */
function serverMessages(body: Record<string, unknown>): { message: string; title?: string }[] {
  const raw = body._server_messages;
  if (typeof raw !== "string") return [];
  try {
    return (JSON.parse(raw) as string[])
      .map((m) => {
        try {
          const o = JSON.parse(m) as { message?: string; title?: string };
          return { message: stripHtml(o.message ?? m), title: o.title ? stripHtml(o.title) : undefined };
        } catch {
          return { message: stripHtml(m) };
        }
      })
      .filter((m) => m.message);
  } catch {
    return [];
  }
}

function errorFrom(status: number, body: Record<string, unknown>): FrappeError {
  const msgs = serverMessages(body);
  const excType = typeof body.exc_type === "string" ? body.exc_type : undefined;
  let message = msgs.map((m) => m.message).join("\n");
  const title = msgs.find((m) => m.title && m.title !== "Message")?.title;
  if (!message && typeof body.exception === "string") {
    // "frappe.exceptions.ValidationError: Row #1: ..." -> the part after the class name
    message = stripHtml(body.exception.replace(/^[\w.]+:\s*/, ""));
  }
  if (!message && typeof body.message === "string") message = stripHtml(body.message);
  if (!message) {
    message =
      status === 403
        ? "You do not have permission for this."
        : status === 417 || status === 409
          ? "The server refused this request."
          : `The server returned an error (HTTP ${status}).`;
  }
  return new FrappeError(message, status, excType, title);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (csrfToken && init.method && init.method !== "GET") headers.set("X-Frappe-CSRF-Token", csrfToken);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new FrappeError("Cannot reach the ERP server. Check the connection and try again.", 0);
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    if (!res.ok) throw new FrappeError(`The server returned an error (HTTP ${res.status}).`, res.status);
  }
  if (!res.ok) throw errorFrom(res.status, body);
  return body as T;
}

/** POST a whitelisted method; returns its `message`. */
export async function call<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const body = await request<{ message: T }>(`/api/method/${method}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  return body.message;
}

/** GET a whitelisted read-only method. */
export async function get<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined && v !== null) qs.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const body = await request<{ message: T }>(`/api/method/${method}${qs.size ? `?${qs}` : ""}`, {
    method: "GET",
  });
  return body.message;
}

const enc = encodeURIComponent;

export async function getDoc<T extends Doc = Doc>(doctype: string, name: string): Promise<T> {
  const body = await request<{ data: T }>(`/api/resource/${enc(doctype)}/${enc(name)}`);
  return body.data;
}

export type ListArgs = {
  fields?: string[];
  filters?: Filters;
  orFilters?: Filters;
  orderBy?: string;
  limit?: number;
  start?: number;
};

export async function getList<T = Row>(doctype: string, args: ListArgs = {}): Promise<T[]> {
  return call<T[]>("frappe.client.get_list", {
    doctype,
    fields: args.fields ?? ["name"],
    filters: args.filters,
    or_filters: args.orFilters,
    order_by: args.orderBy ?? "creation desc",
    limit_page_length: args.limit ?? 50,
    limit_start: args.start ?? 0,
  });
}

export async function getCount(doctype: string, filters?: Filters): Promise<number> {
  return call<number>("frappe.client.get_count", { doctype, filters });
}

export async function insert<T extends Doc = Doc>(doc: Partial<Doc> & { doctype: string }): Promise<T> {
  const body = await request<{ data: T }>(`/api/resource/${enc(doc.doctype)}`, {
    method: "POST",
    body: JSON.stringify(doc),
  });
  return body.data;
}

export async function save<T extends Doc = Doc>(doc: Doc): Promise<T> {
  const body = await request<{ data: T }>(`/api/resource/${enc(doc.doctype)}/${enc(doc.name)}`, {
    method: "PUT",
    body: JSON.stringify(doc),
  });
  return body.data;
}

export async function setValues<T extends Doc = Doc>(doctype: string, name: string, values: Row): Promise<T> {
  const body = await request<{ data: T }>(`/api/resource/${enc(doctype)}/${enc(name)}`, {
    method: "PUT",
    body: JSON.stringify(values),
  });
  return body.data;
}

/** Submit re-reads the document first so the server sees its latest saved state. */
export async function submit<T extends Doc = Doc>(doctype: string, name: string): Promise<T> {
  const doc = await getDoc(doctype, name);
  return call<T>("frappe.client.submit", { doc });
}

export async function cancel(doctype: string, name: string): Promise<void> {
  await call("frappe.client.cancel", { doctype, name });
}

/** Run a method of a saved document (e.g. Pick List.create_stock_reservation_entries). */
export async function docMethod<T = unknown>(doc: Doc, method: string, args: Row = {}): Promise<T> {
  return call<T>("run_doc_method", { dt: doc.doctype, dn: doc.name, method, args: JSON.stringify(args) });
}

/** ERPNext "make" mappers return an unsaved document built from the source document. */
export async function mapDoc<T extends Partial<Doc> = Partial<Doc>>(method: string, args: Row): Promise<T> {
  return call<T>(method, args);
}

export type ReportColumn = { fieldname: string; label: string; fieldtype?: string; options?: string };
export type ReportResult = { columns: ReportColumn[]; result: Row[] };

export async function runReport(reportName: string, filters: Row = {}): Promise<ReportResult> {
  const out = await call<{ columns: (ReportColumn | string)[]; result: (Row | unknown[])[] }>(
    "frappe.desk.query_report.run",
    { report_name: reportName, filters, ignore_prepared_report: true },
  );
  const columns = out.columns.map((c) =>
    typeof c === "string" ? { fieldname: c.split(":")[0] ?? c, label: c.split(":")[0] ?? c } : c,
  );
  // total rows come back as arrays; keep only real rows
  const result = out.result.filter((r): r is Row => !!r && !Array.isArray(r));
  return { columns, result };
}

export type LinkOption = { value: string; description?: string; label?: string };

export async function searchLink(
  doctype: string,
  txt: string,
  filters?: Filters,
  pageLength = 12,
): Promise<LinkOption[]> {
  return call<LinkOption[]>("frappe.desk.search.search_link", {
    doctype,
    txt,
    filters,
    page_length: pageLength,
  });
}

export async function uploadFile(file: File, attach?: { doctype: string; name: string }): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("is_private", "1");
  if (attach) {
    form.append("doctype", attach.doctype);
    form.append("docname", attach.name);
  }
  const body = await request<{ message: { file_url: string } }>("/api/method/upload_file", {
    method: "POST",
    body: form,
  });
  return body.message.file_url;
}

export async function login(usr: string, pwd: string): Promise<void> {
  await request("/api/method/login", { method: "POST", body: JSON.stringify({ usr, pwd }) });
}

export async function logout(): Promise<void> {
  await request("/api/method/logout", { method: "POST" });
}

export function deskUrl(doctype: string, name?: string): string {
  const slug = doctype.toLowerCase().replace(/ /g, "-");
  return name ? `/desk/${slug}/${enc(name)}` : `/desk/${slug}`;
}

export function pdfUrl(doctype: string, name: string, format?: string): string {
  const qs = new URLSearchParams({ doctype, name });
  if (format) qs.set("format", format);
  return `/api/method/frappe.utils.print_format.download_pdf?${qs}`;
}
