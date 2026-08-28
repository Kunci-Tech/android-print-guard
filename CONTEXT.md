# Print Audit Domain

The Print Guard audit domain compares POS-reported sales with independently captured printer evidence for one business date, while distinguishing suspicious changes from ordinary gaps in print coverage.

## Audit Scope

**Operational Date**:
The business date printed inside a Daily Sales Summary Snapshot. An archive may contain several Operational Dates, and an analyst explicitly selects one for reconciliation.
_Avoid_: Archive date, upload date, computer date

**Daily Sales Summary Snapshot**:
A `RINGKASAN PENJUALAN` report printed at a point in time for one Operational Date. Staff may print several snapshots before all bills are closed, so a snapshot is not inherently final.
_Avoid_: Final report, completed report

**Verifying Summary**:
The latest captured Daily Sales Summary Snapshot for the selected Operational Date. It verifies aggregate item quantities, revenue, and cancellation totals for order evidence captured no later than the snapshot.
_Avoid_: Largest summary, first summary

## Order Evidence

**POS Order**:
The order identified by an exact `Order Number: POS-...` value within one Operational Date. All print evidence for that identifier belongs to one Order Evidence Timeline.
_Avoid_: Print job ID, loosely matched order text

**Normalized Product**:
An order item identity formed by joining wrapped product and variant lines and normalizing spacing and separators without discarding meaningful product words.
_Avoid_: Raw receipt line, fuzzy product guess

**Preliminary Bill**:
A customer-facing bill marked `INI BUKAN BUKTI PEMBAYARAN`, printed before payment is completed. It is evidence of the order's contents and value at that point in time, but not evidence of payment.
_Avoid_: Unpaid receipt, final bill

**Final Paid Bill**:
A customer bill with payment evidence, such as a tender, representing the paid state of one POS Order. Whether the customer requests a physical copy does not determine whether the sale is valid.
_Avoid_: Printable recipe, print job

**Bill Reprint**:
Another print of an existing bill for the same POS Order. It adds evidence to the order timeline but never adds another completed invoice.
_Avoid_: Duplicate sale, additional invoice

**Canonical Paid State**:
The latest captured Final Paid Bill for one POS Order after reprints and duplicate network deliveries are collapsed. It is the paid state used for order-level comparison.
_Avoid_: Largest bill, canonical print job

**Order Evidence Timeline**:
All captured kitchen tickets, preliminary bills, add-item or void-item prints, final paid bills, and reprints for one POS Order, ordered by capture time.
_Avoid_: Receipt group, duplicate group

**Production Ticket**:
An item instruction routed to a fulfillment station such as BAR, HOT KITCHEN, or COLD KITCHEN. It is independent evidence that the item entered fulfillment for a POS Order.
_Avoid_: Customer bill, completed invoice

**Normalized Department**:
The fulfillment destination read from the ticket's explicit header or marker, such as BAR, HOT KITCHEN, COLD KITCHEN, or CAPTAIN ORDER. Text elsewhere in the ticket does not determine its department.
_Avoid_: Substring-matched department, printer address

**Duplicate Print Delivery**:
A repeated delivery of the same underlying print payload for the same POS Order. It is retained as transport evidence but counted once when reconstructing Fulfillment Exposure.
_Avoid_: Additional item, bill reprint

**Fulfillment Exposure**:
The highest item quantities evidenced as routed to production during a POS Order's timeline, including later add-item instructions. A later void or removal does not erase the fact that fulfillment was exposed to the item.
_Avoid_: Net order, final order contents

## Audit Findings

**Print Coverage Gap**:
A completed invoice represented by aggregate or order evidence without a captured Final Paid Bill. It is incomplete evidence, not suspicious by itself, because customers may decline a printed final bill.
_Avoid_: Manipulation, stolen order, missing sale

**Post-Routing Reduction**:
An item or value present in Fulfillment Exposure but absent from the later paid POS state or Verifying Summary. It is a high-priority anomaly because fulfilled items may have been removed before the sale was finalized.
_Avoid_: Missing receipt, print failure, post-presentation reduction

**Cancellation Evidence**:
Explicit captured evidence that an invoice or item was canceled or voided. Cancellations are reported separately and checked against the Verifying Summary rather than treated as missing Final Paid Bills.
_Avoid_: Inferred cancellation, missing print

**Complimentary Order**:
A zero-value order explicitly identified as complimentary. It is retained as evidence but excluded from paid-sales reconciliation.
_Avoid_: Cancellation, missing invoice
