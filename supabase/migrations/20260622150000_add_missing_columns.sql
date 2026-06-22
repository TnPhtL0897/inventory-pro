-- Migration: Add missing columns that Drizzle Worker expects
-- Fix for: "column does not exist" errors on units.description, branches.email, warehouses.type

-- 1. units - add description column
ALTER TABLE public.units_of_measure ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. branches - add email + tax_code columns (and possibly address)
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS address TEXT;

-- 3. warehouses - add type + product_group + related columns
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS type TEXT
  CHECK (type IS NULL OR type IN ('RECEIVING', 'ISSUE'));
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS product_group TEXT
  CHECK (product_group IS NULL OR product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE'));
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS allow_negative BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS manager_id UUID;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS attributes TEXT NOT NULL DEFAULT '{}';

-- 4. categories - add sort_order if missing
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 5. parties - ensure all columns exist (likely already done)
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS attributes TEXT NOT NULL DEFAULT '{}';
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0;

-- 6. stock - ensure all columns exist
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS attributes TEXT NOT NULL DEFAULT '{}';

-- 7. Add updatedAt columns where missing (used by routes)
DO $$
BEGIN
  -- units_of_measure
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='units_of_measure' AND column_name='updated_at') THEN
    ALTER TABLE public.units_of_measure ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  -- branches
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='branches' AND column_name='updated_at') THEN
    ALTER TABLE public.branches ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  -- categories
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='categories' AND column_name='updated_at') THEN
    ALTER TABLE public.categories ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  -- parties
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='parties' AND column_name='updated_at') THEN
    ALTER TABLE public.parties ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  -- warehouses
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='warehouses' AND column_name='updated_at') THEN
    ALTER TABLE public.warehouses ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  -- locations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='locations' AND column_name='updated_at') THEN
    ALTER TABLE public.locations ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;