import { useQuery } from "@tanstack/react-query";
import { Search, Upload } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type Filters, type LinkOption, searchLink, uploadFile } from "@/api/frappe";

type Base = { label: string; hint?: ReactNode; required?: boolean; disabled?: boolean; className?: string };

function FieldShell({
  id,
  label,
  hint,
  required,
  children,
  className,
}: Base & { id: string; children: ReactNode }) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  ...base
}: Base & { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} {...base}>
      <div className="input-wrap">
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          required={base.required}
          disabled={base.disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </FieldShell>
  );
}

export function NumberField({
  value,
  onChange,
  unit,
  min,
  step = "any",
  ...base
}: Base & {
  value: number | "";
  onChange: (v: number | "") => void;
  unit?: string;
  min?: number;
  step?: string;
}) {
  const id = useId();
  return (
    <FieldShell id={id} {...base}>
      <div className="input-wrap">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className="num"
          value={value}
          min={min}
          step={step}
          required={base.required}
          disabled={base.disabled}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
        {unit && <span className="input-unit">{unit}</span>}
      </div>
    </FieldShell>
  );
}

export function DateField({
  value,
  onChange,
  ...base
}: Base & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <FieldShell id={id} {...base}>
      <div className="input-wrap">
        <input
          id={id}
          type="date"
          value={value}
          required={base.required}
          disabled={base.disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </FieldShell>
  );
}

/** Date and time; the value is Frappe's "YYYY-MM-DD HH:mm:ss" (the input shows local time). */
export function DateTimeField({
  value,
  onChange,
  ...base
}: Base & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <FieldShell id={id} {...base}>
      <div className="input-wrap">
        <input
          id={id}
          type="datetime-local"
          value={value ? value.replace(" ", "T").slice(0, 16) : ""}
          required={base.required}
          disabled={base.disabled}
          onChange={(e) => onChange(e.target.value ? `${e.target.value.replace("T", " ")}:00` : "")}
        />
      </div>
    </FieldShell>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  ...base
}: Base & {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  const id = useId();
  return (
    <FieldShell id={id} {...base}>
      <div className="input-wrap">
        <select
          id={id}
          value={value}
          required={base.required}
          disabled={base.disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o || "Select…" : o.label;
            return (
              <option key={v} value={v}>
                {l}
              </option>
            );
          })}
        </select>
      </div>
    </FieldShell>
  );
}

export function TextArea({
  value,
  onChange,
  ...base
}: Base & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <FieldShell id={id} {...base}>
      <textarea
        id={id}
        className="textarea"
        rows={3}
        value={value}
        required={base.required}
        disabled={base.disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}

/**
 * A Link field: suggestions come from ERPNext's own link search for that DocType, so they respect
 * the user's permissions and the filters the server applies.
 */
export function LinkField({
  doctype,
  value,
  onChange,
  filters,
  placeholder,
  ...base
}: Base & {
  doctype: string;
  value: string;
  onChange: (v: string, option?: LinkOption) => void;
  filters?: Filters;
  placeholder?: string;
}) {
  const id = useId();
  const listId = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState(value);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 180);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["link", doctype, debounced, JSON.stringify(filters ?? null)],
    queryFn: () => searchLink(doctype, debounced, filters),
    enabled: open && !base.disabled,
    staleTime: 60_000,
  });
  const options = data ?? [];

  function choose(o: LinkOption) {
    setText(o.value);
    setOpen(false);
    onChange(o.value, o);
  }

  return (
    <FieldShell id={id} {...base}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: closes the list when focus leaves the field and its options */}
      <div
        className="combo"
        ref={wrap}
        onBlur={(e) => {
          if (!wrap.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
            if (text !== value) {
              // free text is never accepted: only a value the server suggested
              if (text === "") onChange("");
              else setText(value);
            }
          }
        }}
      >
        <div className="input-wrap">
          <Search className="input-icon" aria-hidden />
          <input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            value={text}
            placeholder={placeholder ?? `Search ${doctype}`}
            required={base.required}
            disabled={base.disabled}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(a + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && open && options[active]) {
                e.preventDefault();
                choose(options[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
        {open && (
          <div className="combo-list float" id={listId} role="listbox">
            {error && <div className="combo-empty">Search failed: {(error as Error).message}</div>}
            {!error && options.length === 0 && (
              <div className="combo-empty">{isFetching ? "Searching…" : `No ${doctype} found`}</div>
            )}
            {options.map((o, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                key={o.value}
                className="combo-opt"
                data-active={i === active || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                <span className="mono">{o.value}</span>
                {(o.label || o.description) && (
                  <span className="combo-desc">{[o.label, o.description].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}

export function FileField({
  value,
  onChange,
  attach,
  accept = "application/pdf,image/*",
  ...base
}: Base & {
  value: string;
  onChange: (url: string) => void;
  attach?: { doctype: string; name: string };
  accept?: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <FieldShell id={id} {...base}>
      <div className="file-row">
        <label className="btn btn-sm" htmlFor={id} aria-disabled={busy || base.disabled}>
          <Upload aria-hidden />
          {busy ? "Uploading…" : value ? "Replace file" : "Upload file"}
        </label>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={busy || base.disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setErr(null);
            try {
              onChange(await uploadFile(f, attach));
            } catch (x) {
              setErr((x as Error).message);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
        {value && (
          <a className="link mono file-name" href={value} target="_blank" rel="noreferrer">
            {decodeURIComponent(value.split("/").pop() ?? value)}
          </a>
        )}
      </div>
      {err && <div className="field-error">{err}</div>}
    </FieldShell>
  );
}
