"""Milestone 4: production on standard ERPNext BOMs and Work Orders, with factory_ops controls.

- ``TestProductionControls``: warehouse defaults, BOM guard, wastage reasons (``_Test Company``).
- ``TestProductionE2E``: the Part 3 flow continued on a perpetual-inventory company: released RM
  and PM -> BULK Work Order (kg, process loss) -> BULK-QC-HOLD -> QC Release -> FG Work Order
  (units) consuming released bulk and PM -> FG-QC-HOLD -> QC Release -> FG-STORES, with a
  component return and a wastage write-off, and the stock ledger and GL checked at every stage.
"""

import frappe
from erpnext.manufacturing.doctype.work_order.work_order import (
	make_stock_entry as wo_stock_entry,
)
from erpnext.manufacturing.doctype.work_order.work_order import (
	make_stock_return_entry,
)
from frappe.utils import flt

from factory_ops.inventory.guards import QCGuardError
from factory_ops.inventory.stock_queries import batch_qty_by_warehouse
from factory_ops.production.controls import WastageReasonError
from factory_ops.quality.doctype.qc_release.qc_release import SegregationOfDutiesError
from factory_ops.setup.sample_company import ensure_boms
from factory_ops.tests.utils import (
	USER_PRODUCTION,
	USER_QC,
	USER_QC_RECEIVER,
	USER_STORES,
	FactoryOpsTestCase,
)

RM1, RM2 = "SAMPLE-RM-0001", "SAMPLE-RM-0002"
PM = "SAMPLE-PM-0001"
BULK, FG = "SAMPLE-BULK-0001", "SAMPLE-FG-0001"
REASON = "Damaged in handling"


def sle(voucher_no: str) -> list[tuple[str, str, float]]:
	rows = frappe.get_all(
		"Stock Ledger Entry",
		filters={"voucher_no": voucher_no, "is_cancelled": 0},
		fields=["item_code", "warehouse", "actual_qty"],
	)
	return sorted((r.item_code, r.warehouse, flt(r.actual_qty, 3)) for r in rows)


def stock_value_change(voucher_no: str) -> float:
	return flt(
		frappe.db.sql(
			"select coalesce(sum(stock_value_difference), 0) from `tabStock Ledger Entry`"
			" where voucher_no=%s and is_cancelled=0",
			voucher_no,
		)[0][0],
		2,
	)


def gl_totals(voucher_no: str) -> tuple[float, float]:
	row = frappe.db.sql(
		"select coalesce(sum(debit),0), coalesce(sum(credit),0) from `tabGL Entry`"
		" where voucher_no=%s and is_cancelled=0",
		voucher_no,
	)[0]
	return flt(row[0], 2), flt(row[1], 2)


def output_batch(stock_entry: str, item_code: str) -> str:
	"""Batch created by a Manufacture entry, read from the database (bundle names are not on the
	in-memory document after submit)."""
	return frappe.db.sql(
		"""select sbe.batch_no from `tabSerial and Batch Entry` sbe
		inner join `tabSerial and Batch Bundle` sbb on sbb.name = sbe.parent
		where sbb.voucher_type = 'Stock Entry' and sbb.voucher_no = %s and sbb.item_code = %s
		and sbe.qty > 0 and sbb.is_cancelled = 0""",
		(stock_entry, item_code),
	)[0][0]


class ProductionTestCase(FactoryOpsTestCase):
	def released_stock(self, item: str, qty: float, rate: float) -> str:
		"""Receive a batch into the item's QC Hold warehouse and release it all; return the batch."""
		group = frappe.db.get_value("Item", item, "item_group")
		hold = self.wh[f"{group}-QC-HOLD"]
		expiry = 600 if frappe.db.get_value("Item", item, "has_expiry_date") else None
		_, batch = self.receive(item, hold, qty, rate=rate, expiry_days=expiry)
		self.qc_release(batch, "Release", item_code=item, source=hold)
		return batch

	def work_order(self, item: str, qty: float, user: str = USER_PRODUCTION, submit: bool = True):
		with self.set_user(user):
			wo = frappe.get_doc(
				{
					"doctype": "Work Order",
					"company": self.company,
					"production_item": item,
					"bom_no": self.boms[item],
					"qty": qty,
				}
			).insert()
			if submit:
				wo.submit()
		return wo

	def stock_entry(self, work_order: str, purpose: str, qty: float, user: str = USER_PRODUCTION):
		with self.set_user(user):
			se = frappe.get_doc(wo_stock_entry(work_order, purpose, qty))
			se.insert()
			se.submit()
		return se

	def issue(self, item, warehouse, qty, reason=None, batch=None, submit=True):
		se = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"purpose": "Material Issue",
				"stock_entry_type": "Material Issue",
				"company": self.company,
				"items": [
					{
						"item_code": item,
						"qty": qty,
						"s_warehouse": warehouse,
						"fo_wastage_reason": reason,
						"use_serial_batch_fields": 1 if batch else 0,
						"batch_no": batch,
					}
				],
			}
		)
		se.insert()
		if submit:
			se.submit()
		return se


class TestProductionControls(ProductionTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.boms = ensure_boms(cls.company)
		frappe.db.commit()

	def test_sample_boms(self):
		bulk = frappe.get_doc("BOM", self.boms[BULK])
		self.assertEqual((bulk.quantity, bulk.process_loss_percentage), (100, 2))
		self.assertEqual({r.item_code: r.qty for r in bulk.items}, {RM1: 5, RM2: 95})
		fg = frappe.get_doc("BOM", self.boms[FG])
		self.assertEqual({r.item_code: r.qty for r in fg.items}, {BULK: 30, PM: 1000})
		# the FG BOM consumes the bulk through the bulk's own BOM (two-stage)
		self.assertEqual(next(r.bom_no for r in fg.items if r.item_code == BULK), bulk.name)
		self.assertEqual(ensure_boms(self.company), self.boms)  # idempotent

	def test_work_order_warehouse_defaults(self):
		bulk = self.work_order(BULK, 100, submit=False)
		self.assertEqual(bulk.wip_warehouse, self.wh["WIP-PRODUCTION"])
		self.assertEqual(bulk.fg_warehouse, self.wh["BULK-QC-HOLD"])
		self.assertEqual({r.source_warehouse for r in bulk.required_items}, {self.wh["RM-STORES"]})
		fg = self.work_order(FG, 1000, submit=False)
		self.assertEqual(fg.fg_warehouse, self.wh["FG-QC-HOLD"])
		self.assertEqual(
			{r.item_code: r.source_warehouse for r in fg.required_items},
			{BULK: self.wh["BULK-STORES"], PM: self.wh["PM-STORES"]},
		)

	def test_explicit_warehouses_are_kept_and_still_guarded(self):
		with self.set_user(USER_PRODUCTION):
			wo = frappe.get_doc(
				{
					"doctype": "Work Order",
					"company": self.company,
					"production_item": FG,
					"bom_no": self.boms[FG],
					"qty": 10,
					"fg_warehouse": self.wh["FG-STORES"],
				}
			)
			self.assertRaises(QCGuardError, wo.insert)  # output must go to QC Hold
			wo.fg_warehouse = self.wh["FG-QC-HOLD"]
			wo.insert()
			wo.required_items[0].source_warehouse = self.wh["BULK-QC-HOLD"]
			self.assertRaises(QCGuardError, wo.save)  # held bulk cannot be consumed

	def test_bom_cannot_draw_from_hold(self):
		bom = frappe.copy_doc(frappe.get_doc("BOM", self.boms[BULK]))
		bom.is_default = 0
		bom.items[0].source_warehouse = self.wh["RM-QC-HOLD"]
		self.assertRaises(QCGuardError, bom.insert)
		bom.items[0].source_warehouse = self.wh["RM-STORES"]
		bom.insert()
		self.assertTrue(bom.name)

	def test_material_issue_needs_a_wastage_reason(self):
		batch = self.released_stock(PM, 100, rate=5)
		stores = self.wh["PM-STORES"]
		with self.set_user(USER_STORES):
			self.assertRaises(WastageReasonError, self.issue, PM, stores, 5, batch=batch)
			frappe.db.set_value("Wastage Reason", "Spillage", "enabled", 0)
			self.assertRaises(WastageReasonError, self.issue, PM, stores, 5, "Spillage", batch)
			se = self.issue(PM, stores, 5, REASON, batch)
		self.assertEqual(se.docstatus, 1)
		self.assertEqual(sle(se.name), [(PM, stores, -5)])

	def test_scrap_from_rejected_uses_the_disposal_reason_instead(self):
		_, batch = self.receive(PM, self.wh["PM-QC-HOLD"], 20)
		self.qc_release(
			batch,
			"Reject",
			item_code=PM,
			source=self.wh["PM-QC-HOLD"],
			qi_status="Rejected",
			reason="SAMPLE: wrong print",
		)
		with self.set_user(USER_STORES):
			se = self.transfer(
				PM,
				batch,
				20,
				self.wh["REJECTED"],
				None,
				purpose="Material Issue",
				fo_disposal_reason="SAMPLE: destroyed",
			)
		self.assertEqual(se.docstatus, 1)


class TestProductionE2E(ProductionTestCase):
	# perpetual inventory on, like the SAMPLE company, so every stage posts real GL entries
	company = "_FO Perpetual Company"
	company_abbr = "_FOPC"

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.boms = ensure_boms(cls.company)
		frappe.db.commit()

	def assert_balanced(self, voucher_no: str):
		debit, credit = gl_totals(voucher_no)
		self.assertEqual(debit, credit, f"GL of {voucher_no} does not balance")

	def assert_stock_reconciles_with_gl(self):
		"""Sum of all stock ledger value changes = balance of the company's stock accounts."""
		sle_value = frappe.db.sql(
			"""select coalesce(sum(sle.stock_value_difference), 0) from `tabStock Ledger Entry` sle
			where sle.company = %s and sle.is_cancelled = 0""",
			self.company,
		)[0][0]
		gl_value = frappe.db.sql(
			"""select coalesce(sum(gle.debit - gle.credit), 0) from `tabGL Entry` gle
			inner join `tabAccount` acc on acc.name = gle.account
			where gle.company = %s and gle.is_cancelled = 0 and acc.account_type = 'Stock'""",
			self.company,
		)[0][0]
		self.assertAlmostEqual(flt(sle_value, 2), flt(gl_value, 2), places=2)

	def test_two_stage_production_with_ledger_checks(self):
		wh = self.wh
		wip = wh["WIP-PRODUCTION"]

		# 0. Released inputs (received into hold by stores, released by QC)
		rm1 = self.released_stock(RM1, 20, rate=200)
		rm2 = self.released_stock(RM2, 200, rate=20)
		pm = self.released_stock(PM, 2000, rate=5)
		self.assert_stock_reconciles_with_gl()

		# 1. BULK Work Order, 100 kg, all warehouses defaulted
		bulk_wo = self.work_order(BULK, 100)
		self.assertEqual((bulk_wo.docstatus, bulk_wo.fg_warehouse), (1, wh["BULK-QC-HOLD"]))
		self.assertEqual(sle(bulk_wo.name), [])

		# 2. Transfer for manufacture: FEFO picks the released batches from RM-STORES into WIP
		transfer = self.stock_entry(bulk_wo.name, "Material Transfer for Manufacture", 100)
		self.assertEqual(
			sle(transfer.name),
			sorted([(RM1, wh["RM-STORES"], -5), (RM1, wip, 5), (RM2, wh["RM-STORES"], -95), (RM2, wip, 95)]),
		)
		self.assertEqual(batch_qty_by_warehouse(rm1), {wh["RM-STORES"]: 15, wip: 5})
		self.assertEqual(stock_value_change(transfer.name), 0)
		self.assert_balanced(transfer.name)

		# 3. Manufacture: 100 kg in, 2 % process loss, 98 kg of a new bulk batch into BULK-QC-HOLD
		make_bulk = self.stock_entry(bulk_wo.name, "Manufacture", 100)
		self.assertEqual(
			sle(make_bulk.name),
			sorted([(RM1, wip, -5), (RM2, wip, -95), (BULK, wh["BULK-QC-HOLD"], 98)]),
		)
		self.assertEqual(flt(make_bulk.process_loss_qty, 3), 2)
		bulk = output_batch(make_bulk.name, BULK)
		self.assertEqual(batch_qty_by_warehouse(bulk), {wh["BULK-QC-HOLD"]: 98})
		self.assertEqual(frappe.db.get_value("Batch", bulk, "fo_qc_status"), "Hold")
		# the whole input value (5 x 200 + 95 x 20 = 2,900) is carried by the 98 kg produced
		self.assertEqual(stock_value_change(make_bulk.name), 0)
		bulk_value = flt(
			frappe.db.get_value(
				"Stock Ledger Entry",
				{"voucher_no": make_bulk.name, "item_code": BULK, "is_cancelled": 0},
				"stock_value_difference",
			),
			2,
		)
		self.assertEqual(bulk_value, 2900)
		self.assert_balanced(make_bulk.name)
		bulk_wo.reload()
		self.assertEqual((bulk_wo.status, flt(bulk_wo.produced_qty)), ("Completed", 98))

		# 4. Held bulk cannot be filled
		fg_wo = self.work_order(FG, 1000)
		with self.set_user(USER_PRODUCTION):
			blocked = frappe.get_doc(wo_stock_entry(fg_wo.name, "Material Transfer for Manufacture", 1000))
			for row in blocked.items:
				if row.item_code == BULK:
					row.s_warehouse = wh["BULK-QC-HOLD"]
					row.use_serial_batch_fields = 1
					row.batch_no = bulk
			self.assertRaises(QCGuardError, blocked.insert)

		# 5. QC releases the bulk; whoever owns the bulk Work Order may not
		frappe.db.set_value("Work Order", bulk_wo.name, "owner", USER_QC_RECEIVER)
		self.assertRaises(
			SegregationOfDutiesError,
			self.qc_release,
			bulk,
			"Release",
			item_code=BULK,
			source=wh["BULK-QC-HOLD"],
			user=USER_QC_RECEIVER,
		)
		rel = self.qc_release(bulk, "Release", item_code=BULK, source=wh["BULK-QC-HOLD"])
		self.assertEqual(batch_qty_by_warehouse(bulk), {wh["BULK-STORES"]: 98})
		self.assert_balanced(rel.stock_entry)

		# 6. FG transfer: 30 kg released bulk + 1,000 bottles into WIP
		fg_transfer = self.stock_entry(fg_wo.name, "Material Transfer for Manufacture", 1000)
		self.assertEqual(
			sle(fg_transfer.name),
			sorted(
				[
					(BULK, wh["BULK-STORES"], -30),
					(BULK, wip, 30),
					(PM, wh["PM-STORES"], -1000),
					(PM, wip, 1000),
				]
			),
		)

		# 7. Short fill: 950 units made; consumption follows what was transferred, pro rata
		make_fg = self.stock_entry(fg_wo.name, "Manufacture", 950)
		self.assertEqual(
			sle(make_fg.name),
			sorted([(BULK, wip, -28.5), (PM, wip, -950), (FG, wh["FG-QC-HOLD"], 950)]),
		)
		fg_batch = output_batch(make_fg.name, FG)
		batch_doc = frappe.get_doc("Batch", fg_batch)
		self.assertEqual(batch_doc.fo_qc_status, "Hold")
		self.assertTrue(batch_doc.expiry_date and batch_doc.manufacturing_date)
		self.assertEqual(stock_value_change(make_fg.name), 0)
		self.assert_balanced(make_fg.name)

		# 8. Material return: unused bulk and bottles go back from WIP to their stores
		with self.set_user(USER_PRODUCTION):
			ret = make_stock_return_entry(fg_wo.name)
			ret.insert()
			ret.submit()
		self.assertEqual(
			sle(ret.name),
			sorted(
				[
					(BULK, wip, -1.5),
					(BULK, wh["BULK-STORES"], 1.5),
					(PM, wip, -50),
					(PM, wh["PM-STORES"], 50),
				]
			),
		)
		self.assertEqual(batch_qty_by_warehouse(bulk), {wh["BULK-STORES"]: 69.5})
		self.assertEqual(self._balance(BULK, wip), 0)
		self.assertEqual(self._balance(PM, wip), 0)

		# 9. Wastage: damaged bottles written off from stores, with a reason
		with self.set_user(USER_STORES):
			self.assertRaises(WastageReasonError, self.issue, PM, wh["PM-STORES"], 10, None, pm)
			waste = self.issue(PM, wh["PM-STORES"], 10, REASON, pm)
		self.assertEqual(stock_value_change(waste.name), -50)
		self.assert_balanced(waste.name)

		# 10. FG release to FG-STORES
		fg_rel = self.qc_release(fg_batch, "Release", item_code=FG, source=wh["FG-QC-HOLD"])
		self.assertEqual(batch_qty_by_warehouse(fg_batch), {wh["FG-STORES"]: 950})
		self.assertEqual(frappe.db.get_value("Batch", fg_batch, "fo_qc_status"), "Released")
		self.assert_balanced(fg_rel.stock_entry)

		# 11. Stock ledger and general ledger agree for the whole company
		self.assertEqual(batch_qty_by_warehouse(rm2), {wh["RM-STORES"]: 105})
		self.assert_stock_reconciles_with_gl()

	def _balance(self, item: str, warehouse: str) -> float:
		return flt(
			frappe.db.sql(
				"select coalesce(sum(actual_qty), 0) from `tabStock Ledger Entry`"
				" where item_code=%s and warehouse=%s and is_cancelled=0",
				(item, warehouse),
			)[0][0],
			3,
		)
