-- ============================================================================
-- AEGIS FINANCE - DATABASE SCHEMA FIX
-- ============================================================================
-- This fixes the invoices table to work with wallet addresses directly
-- instead of requiring company UUIDs
-- ============================================================================

-- Drop the existing invoices table (WARNING: This will delete all data!)
DROP TABLE IF EXISTS invoices CASCADE;

-- Recreate invoices table with wallet addresses instead of company UUIDs
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT UNIQUE NOT NULL,
    amount DECIMAL(18, 2) NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'USDC',
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Use wallet addresses directly (no foreign key to companies)
    supplier_address TEXT NOT NULL,
    buyer_address TEXT NOT NULL,

    pdf_url TEXT,
    metadata JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'FINANCED', 'REJECTED', 'PAID', 'REPAID')),

    -- Aegis AI pricing data
    aegis_payout_offer DECIMAL(18, 2),
    aegis_repayment_amount DECIMAL(18, 2),
    aegis_discount_rate DECIMAL(5, 4),
    aegis_risk_score DECIMAL(5, 2),
    aegis_pricing_explanation TEXT,
    aegis_signature TEXT,
    aegis_nonce BIGINT,
    aegis_deadline BIGINT,
    aegis_due_date BIGINT,

    -- Blockchain data
    financing_tx_hash TEXT,
    repayment_tx_hash TEXT,
    blockchain_confirmed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_invoices_supplier_address ON invoices(supplier_address);
CREATE INDEX idx_invoices_buyer_address ON invoices(buyer_address);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_financing_tx ON invoices(financing_tx_hash);
CREATE INDEX idx_invoices_repayment_tx ON invoices(repayment_tx_hash);

-- Add trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Invoices table has been recreated successfully!';
    RAISE NOTICE 'You can now create invoices using wallet addresses directly.';
END $$;
