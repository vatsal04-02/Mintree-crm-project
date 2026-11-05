import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LogOut,
  Menu,
  Plus,
  Search,
} from "lucide-react";
import { Dialog, DropdownMenu, Popover } from "radix-ui";
import { useEffect, useMemo, useState } from "react";
import { getList, logout, searchLink } from "@/api/frappe";
import { BOOT_KEY, can, isSampleCompany, useSession } from "@/api/session";
import { formatDateTime } from "@/lib/format";
import { useHotkeys } from "@/lib/hotkeys";
import {
  allPages,
  type Module,
  moduleForPath,
  type NavItem,
  quickActions,
  SEARCHABLE,
  visibleModules,
} from "@/nav";

/** "/a/b?x=1" -> { to: "/a/b", search: { x: "1" } } for router links. */
export function splitTo(to: string): { to: string; search?: Record<string, string> } {
  const [path = to, q] = to.split("?");
  return q ? { to: path, search: Object.fromEntries(new URLSearchParams(q)) } : { to: path };
}

function leaves(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => (i.children ? leaves(i.children) : [i]));
}

/** How well a nav target matches the current location (higher wins; 0 = no match). */
function score(target: string, path: string, search: string): number {
  const [p, q] = target.split("?");
  if (q) return path === p && search.includes(q) ? 3 : 0;
  if (path === p) return 2;
  return p !== "/" && path.startsWith(`${p}/`) && !path.endsWith("/new") ? 1 : 0;
}

/** The one item in a module panel that represents where the user is. */
function activeTarget(m: Module | undefined, path: string, search: string): string | undefined {
  let best: string | undefined;
  let top = 0;
  for (const i of leaves(m?.items ?? [])) {
    const s = i.to ? score(i.to, path, search) : 0;
    if (s > top) {
      top = s;
      best = i.to;
    }
  }
  return best;
}

/* ---------------- Icon rail ---------------- */

function Rail({
  modules,
  open,
  onOpen,
  onSearch,
}: {
  modules: Module[];
  open: string;
  onOpen: (key: string) => void;
  onSearch: () => void;
}) {
  return (
    <nav className="rail" aria-label="Modules">
      <Link to="/" className="rail-logo" aria-label="Mintree Factory OS home" onClick={() => onOpen("home")}>
        <img src={`${import.meta.env.BASE_URL}mark.svg`} alt="" width={28} height={28} />
      </Link>
      <button
        type="button"
        className="rail-btn"
        aria-label="Search (Ctrl K)"
        title="Search  Ctrl K"
        onClick={onSearch}
      >
        <Search aria-hidden />
      </button>
      <Notifications />
      <div className="rail-rule" />
      <div className="rail-modules">
        {modules
          .filter((m) => m.key !== "home")
          .map((m) => (
            <button
              key={m.key}
              type="button"
              className="rail-btn"
              aria-label={m.label}
              title={m.label}
              aria-pressed={open === m.key}
              onClick={() => onOpen(m.key)}
            >
              <m.icon aria-hidden />
            </button>
          ))}
      </div>
      <UserMenu />
    </nav>
  );
}

/* ---------------- Module panel ---------------- */

function PanelItem({
  item,
  active,
  depth = 0,
  onNavigate,
}: {
  item: NavItem;
  active?: string;
  depth?: number;
  onNavigate?: () => void;
}) {
  const hasActive = item.children ? leaves(item.children).some((c) => c.to === active) : false;
  const [expanded, setExpanded] = useState(hasActive || item.label !== "Create");
  useEffect(() => {
    if (hasActive) setExpanded(true);
  }, [hasActive]);
  if (item.children) {
    return (
      <div className="pn-group">
        <button
          type="button"
          className="pn-item"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {item.icon && <item.icon aria-hidden className="pn-icon" />}
          <span className="pn-label">{item.label}</span>
          {expanded ? (
            <ChevronDown aria-hidden className="pn-chev" />
          ) : (
            <ChevronRight aria-hidden className="pn-chev" />
          )}
        </button>
        {expanded && (
          <div className="pn-children">
            {item.children.map((c) => (
              <PanelItem
                key={c.to ?? c.label}
                item={c}
                active={active}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  const link = splitTo(item.to ?? "/");
  const isActive = item.to === active;
  return (
    <Link
      to={link.to}
      search={link.search}
      className="pn-item"
      data-active={isActive || undefined}
      aria-current={isActive ? "page" : undefined}
      activeOptions={{ exact: true, includeSearch: true }}
      activeProps={{}}
      onClick={onNavigate}
    >
      {depth === 0 && item.icon && <item.icon aria-hidden className="pn-icon" />}
      <span className="pn-label">{item.label}</span>
    </Link>
  );
}

function ModulePanel({
  modules,
  module,
  active,
  onOpen,
  onNavigate,
}: {
  modules: Module[];
  module: Module;
  active?: string;
  onOpen: (key: string) => void;
  onNavigate?: () => void;
}) {
  const boot = useSession();
  return (
    <aside className="panel-nav" aria-label={`${module.label} pages`}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="pn-title">
            <span>{module.label}</span>
            <ChevronDown aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="float menu" align="start" sideOffset={4}>
            {modules.map((m) => (
              <DropdownMenu.Item key={m.key} className="menu-item" onSelect={() => onOpen(m.key)}>
                <m.icon aria-hidden />
                {m.label}
                {m.key === module.key && <Check aria-hidden className="menu-check" />}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <div className="pn-list">
        {module.items.map((i) => (
          <PanelItem
            key={`${module.key}:${i.to ?? i.label}`}
            item={i}
            active={active}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <div className="pn-foot">
        <div className="pn-company-row">
          <span className="pn-company" title="Company in the ERP">
            {boot.company ?? "No default company"}
          </span>
          {isSampleCompany(boot) && (
            <span className="sample-badge" title="Development data, not real">
              SAMPLE
            </span>
          )}
        </div>
        <a className="pn-desk" href={boot.desk_url} target="_blank" rel="noreferrer">
          Open ERPNext Desk <ExternalLink aria-hidden />
        </a>
      </div>
    </aside>
  );
}

/* ---------------- Notifications, account ---------------- */

function Notifications() {
  const boot = useSession();
  const { data, error } = useQuery({
    queryKey: ["notifications", boot.user],
    queryFn: () =>
      getList<{
        name: string;
        subject: string;
        document_type: string;
        document_name: string;
        read: number;
        creation: string;
      }>("Notification Log", {
        fields: ["name", "subject", "document_type", "document_name", "read", "creation"],
        filters: { for_user: boot.user },
        limit: 15,
      }),
    refetchInterval: 120_000,
  });
  const unread = data?.filter((n) => !n.read).length ?? 0;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="rail-btn"
          aria-label={`Notifications, ${unread} unread`}
          title="Notifications"
        >
          <Bell aria-hidden />
          {unread > 0 && <span className="rail-dot" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="float popover" side="right" align="start" sideOffset={8}>
          <div className="popover-head">Notifications</div>
          {error && <p className="popover-empty">Could not load notifications: {(error as Error).message}</p>}
          {!error && (data?.length ?? 0) === 0 && (
            <p className="popover-empty">No notifications from the ERP.</p>
          )}
          <ul className="notif-list">
            {data?.map((n) => (
              <li key={n.name} data-unread={!n.read || undefined}>
                <a
                  href={`/desk/${n.document_type?.toLowerCase().replace(/ /g, "-")}/${encodeURIComponent(n.document_name)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="notif-subject">{n.subject?.replace(/<[^>]+>/g, "")}</span>
                  <span className="notif-time">{formatDateTime(n.creation)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function UserMenu() {
  const boot = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const initials = boot.full_name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="avatar"
          aria-label={`Account: ${boot.full_name}`}
          title={boot.full_name}
        >
          {initials}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="float menu" side="right" align="end" sideOffset={8}>
          <div className="menu-head">
            <strong>{boot.full_name}</strong>
            <span className="mono">{boot.user}</span>
            <span className="menu-roles">
              {boot.roles.filter((r) => !["All", "Guest", "Desk User"].includes(r)).join(", ")}
            </span>
          </div>
          <DropdownMenu.Item asChild className="menu-item">
            <a href={boot.desk_url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> Open ERPNext Desk
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="menu-item"
            onSelect={async () => {
              await logout().catch(() => undefined);
              qc.setQueryData(BOOT_KEY, null);
              qc.clear();
              navigate({ to: "/login" });
            }}
          >
            <LogOut aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ---------------- Search ---------------- */

function Palette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const boot = useSession();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const sources = SEARCHABLE.filter((s) => can(boot, s.doctype, "read"));
  const { data: hits, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async () => {
      const res = await Promise.all(
        sources.map((s) =>
          searchLink(s.doctype, debounced, undefined, 5)
            .then((r) => r.map((o) => ({ ...o, doctype: s.doctype, to: s.route(o.value) })))
            .catch(() => []),
        ),
      );
      return res.flat();
    },
  });
  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(splitTo(to));
  };
  const needle = q.toLowerCase();
  const pages = allPages(boot).filter(
    (p) =>
      !p.label.startsWith("New ") &&
      (!q || `${p.label} ${p.module} ${p.keywords ?? ""}`.toLowerCase().includes(needle)),
  );
  const creates = quickActions(boot).filter((a) => !q || a.label.toLowerCase().includes(needle));
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="cmdk float" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={false} label="Search Factory OS">
            <Command.Input value={q} onValueChange={setQ} placeholder="Search documents, batches, pages…" />
            <Command.List>
              {debounced.length >= 2 && !isFetching && (hits?.length ?? 0) === 0 && pages.length === 0 && (
                <Command.Empty>Nothing you can open matches “{debounced}”.</Command.Empty>
              )}
              {(hits?.length ?? 0) > 0 && (
                <Command.Group heading="Documents">
                  {hits?.map((h) => (
                    <Command.Item
                      key={`${h.doctype}:${h.value}`}
                      value={`${h.doctype}:${h.value}`}
                      onSelect={() => go(h.to)}
                    >
                      <span className="mono">{h.value}</span>
                      <span className="cmdk-meta">
                        {h.doctype}
                        {h.description ? ` · ${h.description}` : ""}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {pages.length > 0 && (
                <Command.Group heading="Pages">
                  {pages.map((p) => (
                    <Command.Item key={p.to} value={p.to} onSelect={() => go(p.to)}>
                      {p.label}
                      <span className="cmdk-meta">{p.module}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {creates.length > 0 && (
                <Command.Group heading="Create">
                  {creates.map((a) => (
                    <Command.Item key={a.to} value={`new:${a.to}`} onSelect={() => go(a.to)}>
                      <Plus aria-hidden />
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------- Layout ---------------- */

export function Shell() {
  const boot = useSession();
  const modules = useMemo(() => visibleModules(boot), [boot]);
  const loc = useRouterState({ select: (s) => s.location });
  const path = loc.pathname.replace(/^\/factory/, "") || "/";
  const search = loc.searchStr ?? "";
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [openKey, setOpenKey] = useState<string>(() => moduleForPath(modules, path)?.key ?? "home");

  // Follow the URL: keep the open module while it lists where you are, else switch to the owner.
  useEffect(() => {
    setOpenKey((current) => {
      const cur = modules.find((m) => m.key === current);
      if (cur && activeTarget(cur, path, search)) return current;
      return moduleForPath(modules, path)?.key ?? current;
    });
    setDrawer(false);
  }, [path, search, modules]);

  useHotkeys({ "mod+k": () => setPalette(true), "/": () => setPalette(true) });

  const module = modules.find((m) => m.key === openKey) ?? modules[0];
  if (!module) return null;
  const active = activeTarget(module, path, search);

  return (
    <div className="app">
      <div className="side">
        <Rail modules={modules} open={module.key} onOpen={setOpenKey} onSearch={() => setPalette(true)} />
        <ModulePanel modules={modules} module={module} active={active} onOpen={setOpenKey} />
      </div>
      <div className="main">
        <header className="mobile-bar">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
          >
            <Menu aria-hidden />
          </button>
          <span className="mobile-title">{module.label}</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Search"
            onClick={() => setPalette(true)}
          >
            <Search aria-hidden />
          </button>
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
      <Palette open={palette} setOpen={setPalette} />
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="drawer" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Rail modules={modules} open={module.key} onOpen={setOpenKey} onSearch={() => setPalette(true)} />
            <ModulePanel
              modules={modules}
              module={module}
              active={active}
              onOpen={setOpenKey}
              onNavigate={() => setDrawer(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
