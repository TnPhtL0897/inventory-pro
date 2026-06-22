-- Migration: Add bid_plans + purchase_requests columns

-- bid_plans
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS plan_number TEXT;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS plan_name TEXT;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS fiscal_year INTEGER;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS approval_date DATE;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS total_estimated_value NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.bid_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS bid_plans_number_tenant_idx ON public.bid_plans(tenant_id, plan_number) WHERE plan_number IS NOT NULL;

-- bid_packages
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS package_number TEXT;
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS bid_method TEXT NOT NULL DEFAULT 'OPEN_TENDER';
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS publish_date DATE;
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS bid_open_date DATE;
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS bid_close_date DATE;
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.bid_packages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- bid_lots
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS lot_name TEXT;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS product_group TEXT;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS estimated_qty NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS estimated_unit_price NUMERIC(18,4);
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS estimated_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS awarded_party_id UUID;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS awarded_qty NUMERIC(18,4);
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS awarded_unit_price NUMERIC(18,4);
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.bid_lots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- bid_contracts
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS party_id UUID;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS bid_package_id UUID;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS bid_lot_id UUID;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS contract_value NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS used_value NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS signed_date DATE;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.bid_contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- purchase_requests
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS pr_number TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS request_dept TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS bid_plan_id UUID;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS needed_by DATE;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS total_estimated_value NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_number_tenant_idx ON public.purchase_requests(tenant_id, pr_number) WHERE pr_number IS NOT NULL;

-- purchase_request_lines
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS pr_id UUID;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS unit_id UUID;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS estimated_unit_price NUMERIC(18,4);
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS suggested_party_id UUID;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS suggested_bid_contract_id UUID;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS line_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_request_lines ADD COLUMN IF NOT EXISTS notes TEXT;
CREATE INDEX IF NOT EXISTS purchase_request_lines_pr_idx ON public.purchase_request_lines(pr_id);