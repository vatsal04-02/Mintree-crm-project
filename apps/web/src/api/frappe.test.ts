import { afterEach, describe, expect, it, vi } from "vitest";
import { call, FrappeError, get, setCsrfToken, submit } from "./frappe";

function reply(status: number, body: unknown) {
  return vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken("");
});

describe("Frappe client", () => {
  it("sends the session CSRF token on writes, never on reads", async () => {
    const fetchMock = reply(200, { message: 1 });
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("tok-123");
    await call("frappe.client.get_count", { doctype: "Item" });
    await get("factory_ops.api.factory_os.boot");
    const [, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, getInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(postInit.headers).get("X-Frappe-CSRF-Token")).toBe("tok-123");
    expect(postInit.credentials).toBe("same-origin");
    expect(new Headers(getInit.headers).get("X-Frappe-CSRF-Token")).toBeNull();
  });

  it("shows the server's own refusal message and title", async () => {
    const msg = JSON.stringify({
      message: "You created Purchase Order PO-1, so another approver must submit it.",
      title: "Approval required",
    });
    vi.stubGlobal(
      "fetch",
      reply(403, { exc_type: "SelfApprovalError", _server_messages: JSON.stringify([msg]) }),
    );
    const err = await call<never>("frappe.client.submit", {}).catch((e: FrappeError) => e);
    expect(err).toBeInstanceOf(FrappeError);
    expect(err.message).toBe("You created Purchase Order PO-1, so another approver must submit it.");
    expect(err.title).toBe("Approval required");
    expect(err.status).toBe(403);
  });

  it("falls back to the exception text, without the class name or HTML", async () => {
    vi.stubGlobal(
      "fetch",
      reply(417, {
        exception: "factory_ops.inventory.guards.QCGuardError: Row #1: <b>SAMPLE-RM</b> is on QC Hold",
      }),
    );
    const err = await call<never>("x").catch((e: FrappeError) => e);
    expect(err.message).toBe("Row #1: SAMPLE-RM is on QC Hold");
  });

  it("shows server messages as plain text (markup removed)", async () => {
    const hit = vi.fn();
    (window as unknown as { __hit: () => void }).__hit = hit;
    const msg = JSON.stringify({ message: 'Item <img src="x" onerror="window.__hit()"> is held' });
    vi.stubGlobal("fetch", reply(417, { _server_messages: JSON.stringify([msg]) }));
    const err = await call<never>("x").catch((e: FrappeError) => e);
    await new Promise((r) => setTimeout(r, 20));
    expect(err.message).toBe("Item  is held");
    expect(hit).not.toHaveBeenCalled();
  });

  it("reports an unreachable server plainly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await call<never>("x").catch((e: FrappeError) => e);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Cannot reach the ERP server/);
  });

  it("submits the latest saved document, not a stale copy", async () => {
    const saved = { name: "PO-1", doctype: "Purchase Order", docstatus: 0, modified: "2026-11-05 10:00:00" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: saved }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { ...saved, docstatus: 1 } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const out = await submit("Purchase Order", "PO-1");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/resource/Purchase%20Order/PO-1");
    const body = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(body.doc.modified).toBe("2026-11-05 10:00:00");
    expect(out.docstatus).toBe(1);
  });
});
