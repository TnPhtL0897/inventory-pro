-- Migration: Add columns for stock_transfers, purchase_orders, goods_receipts

-- stock_transfers
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS transfer_number TEXT;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_branch_id UUID;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_warehouse_id UUID;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_branch_id UUID;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_warehouse_id UUID;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS transfer_date DATE;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS expected_receipt_date DATE;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS posted_by UUID;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS received_by UUID;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS transfer_id UUID;
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS from_location_id UUID;
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS to_location_id UUID;
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS batch_no TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS serial_no TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4);
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS line_status TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE public.stock_transfer_lines ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 0;

-- stock_issues
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS issue_number TEXT;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS party_id UUID;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'INTERNAL_USE';
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS posted_by UUID;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS issue_id UUID;
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE public.stock_issues ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS batch_no TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS serial_no TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4);
ALTER TABLE public.stock_issue_lines ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 0;

-- stock_takes
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS stock_take_number TEXT;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS stock_take_date DATE;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS counted_by UUID;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS posted_by UUID;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.stock_takes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS stock_take_id UUID;
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS system_qty NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS counted_qty NUMERIC(18,4);
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS variance_qty NUMERIC(18,4);
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS line_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.stock_take_lines ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 0;

-- purchase_orders
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS bid_contract_id UUID;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS bid_lot_id UUID;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS order_date DATE;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS grand_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS po_id UUID;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS line_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 0;

-- goods_receipts
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS grn_number TEXT;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS po_id UUID;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS party_id UUID;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS bid_contract_id UUID;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS bid_lot_id UUID;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS receipt_date DATE;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS supplier_invoice_no TEXT;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS total_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS grand_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS posted_by UUID;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS grn_id UUID;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS po_line_id UUID;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS batch_no TEXT NOT NULL DEFAULT '';
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS serial_no TEXT NOT NULL DEFAULT '';
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS expiry_date TEXT;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS line_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.goods_receipt_lines ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 0;