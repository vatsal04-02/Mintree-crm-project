import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Bell, Building2, ExternalLink, LogOut, Menu, Plus, Search } from "lucide-react";
import { Dialog, DropdownMenu, Popover } from "radix-ui";
import { useEffect, useState } from "react";
import { getList, logout, searchLink } from "@/api/frappe";
import { BOOT_KEY, can, isSampleCompany, useSession } from "@/api/session";
import { formatDateTime } from "@/lib/format";
import { useHotkeys } from "@/lib/hotkeys";
import { quickActions, SEARCHABLE, visibleNav } from "@/nav";

function Brand() {
  const boot = useSession();
  return (
    <div className="brand">
      <img src={`${import.meta.env.BASE_URL}mark.svg`} alt="" width={22} height={22} />
      <span className="brand-name">Mintree Factory OS</span>
      {isSampleCompany(boot) && (
        <span className="sample-badge" title="Development data, not real">
          SAMPLE
        </span>
      )}
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const boot = useSession();
  return (
    <nav aria-label="Main" className="side-nav">
      {visibleNav(boot).map((g) => (
        <div key={g.label}>
          <div className="nav-group">{g.label}</div>
          {g.items.map((i) => (
            <Link
              key={i.to}
              to={i.to}
              className="nav-link"
              activeOptions={{ exact: i.to === "/" }}
              onClick={onNavigate}
            >
              <i.icon aria-hidden />
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

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
          className="btn btn-ghost btn-icon top-icon"
          aria-label={`Notifications, ${unread} unread`}
        >
          <Bell aria-hidden />
          {unread > 0 && <span className="dot-count">{unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="float popover" align="end" sideOffset={6}>
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
        <button type="button" className="avatar" aria-label={`Account: ${boot.full_name}`}>
          {initials}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="float menu" align="end" sideOffset={6}>
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

function NewMenu() {
  const boot = useSession();
  const navigate = useNavigate();
  const actions = quickActions(boot);
  if (!actions.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="btn btn-sm">
          <Plus aria-hidden /> New
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="float menu" align="end" sideOffset={6}>
          {actions.map((a) => (
            <DropdownMenu.Item key={a.to} className="menu-item" onSelect={() => navigate({ to: a.to })}>
              {a.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Global search: pages, quick actions and the ERP documents this user may read. */
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
    navigate({ to });
  };
  const pages = visibleNav(boot).flatMap((g) => g.items);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="cmdk float" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={false} label="Search Factory OS">
            <Command.Input value={q} onValueChange={setQ} placeholder="Search documents, batches, pages…" />
            <Command.List>
              {debounced.length >= 2 && !isFetching && (hits?.length ?? 0) === 0 && (
                <Command.Empty>No documents you can open match “{debounced}”.</Command.Empty>
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
              <Command.Group heading="Pages">
                {pages
                  .filter(
                    (p) => !q || `${p.label} ${p.keywords ?? ""}`.toLowerCase().includes(q.toLowerCase()),
                  )
                  .map((p) => (
                    <Command.Item key={p.to} value={p.to} onSelect={() => go(p.to)}>
                      <p.icon aria-hidden />
                      {p.label}
                    </Command.Item>
                  ))}
              </Command.Group>
              <Command.Group heading="Create">
                {quickActions(boot)
                  .filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase()))
                  .map((a) => (
                    <Command.Item key={a.to} value={a.to} onSelect={() => go(a.to)}>
                      <Plus aria-hidden />
                      {a.label}
                    </Command.Item>
                  ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Shell() {
  const boot = useSession();
  const [palette, setPalette] = useState(false);
  const [nav, setNav] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useHotkeys({ "mod+k": () => setPalette(true), "/": () => setPalette(true) });
  // close the phone drawer on navigation
  // biome-ignore lint/correctness/useExhaustiveDependencies: path is the trigger
  useEffect(() => setNav(false), [path]);
  return (
    <div className="shell">
      <aside className="shell-side">
        <Brand />
        <SideNav />
      </aside>
      <header className="shell-top">
        <button
          type="button"
          className="btn btn-ghost btn-icon phone-only"
          aria-label="Open menu"
          onClick={() => setNav(true)}
        >
          <Menu aria-hidden />
        </button>
        <button type="button" className="search-trigger" onClick={() => setPalette(true)}>
          <Search aria-hidden />
          <span>Search documents and pages</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="top-right">
          <NewMenu />
          <span className="company" title="Company in the ERP">
            <Building2 aria-hidden />
            <span className="company-name">{boot.company ?? "No default company"}</span>
          </span>
          <Notifications />
          <UserMenu />
        </div>
      </header>
      <main className="shell-sheet" id="main">
        <Outlet />
      </main>
      <Palette open={palette} setOpen={setPalette} />
      <Dialog.Root open={nav} onOpenChange={setNav}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="drawer" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Brand />
            <SideNav onNavigate={() => setNav(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
