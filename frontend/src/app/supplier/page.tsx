'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, id as hashString } from 'viem';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/types';
import { InvoiceCard } from '@/components/InvoiceCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ArcPoolABI from '@/contracts/ArcPool.json';

type Invoice = Database['public']['Tables']['invoices']['Row'];

export default function SupplierPortal() {
  const { address, isConnected } = useAccount();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const contractAddress = process.env.NEXT_PUBLIC_ARC_CONTRACT_ADDRESS as `0x${string}` || '0x';

  const {
    writeContract,
    data: hash,
    isPending: isWritePending,
    error: writeError
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    loadInvoices();
  }, [address]);

  const loadInvoices = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // In production, you would filter by supplier_id based on user profile
      const { data, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setInvoices(data || []);
    } catch (err) {
      console.error('Error loading invoices:', err);
      setError('Failed to load invoices');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptFinancing = async (invoice: Invoice) => {
    if (!invoice.aegis_signature || !invoice.aegis_payout_offer) {
      setError('Invalid invoice signature or payout offer');
      return;
    }

    try {
      const signatureData = JSON.parse(invoice.aegis_signature);

      // V2 Contract Call with 7 parameters
      await writeContract({
        address: contractAddress,
        abi: ArcPoolABI,
        functionName: 'withdrawFinancing',
        args: [
          hashString(invoice.id),                                      // invoiceId
          parseUnits(invoice.aegis_payout_offer.toString(), 6),        // payoutAmount
          parseUnits(signatureData.repaymentAmount.toString(), 6),     // repaymentAmount ← NEW
          BigInt(signatureData.dueDate),                               // dueDate ← NEW
          BigInt(signatureData.nonce),                                 // nonce
          BigInt(signatureData.deadline),                              // deadline
          signatureData.signature as `0x${string}`,                    // signature
        ],
      });

      // Update invoice status in database after successful transaction
      if (isSuccess) {
        await supabase
          .from('invoices')
          .update({
            status: 'FINANCED',
            blockchain_tx_hash: hash,
          })
          .eq('id', invoice.id);

        loadInvoices();
      }
    } catch (err) {
      console.error('Error accepting financing:', err);
      setError(err instanceof Error ? err.message : 'Failed to accept financing');
    }
  };

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Card>
          <CardContent className="py-16">
            <p className="text-center text-xl text-muted-foreground">
              Please connect your wallet to access the Supplier Portal
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Supplier Portal</h1>
        <p className="text-muted-foreground">
          View your invoices and accept financing offers
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isSuccess && (
        <Alert className="mb-6">
          <AlertDescription>
            ✓ Financing accepted successfully! Transaction: {hash?.slice(0, 10)}...
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{invoices.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {invoices.filter((i) => i.status === 'APPROVED').length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Financed Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {invoices.filter((i) => i.status === 'FINANCED').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoices List */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Your Invoices</h2>

        {isLoading ? (
          <Card>
            <CardContent className="py-16">
              <p className="text-center text-muted-foreground">Loading invoices...</p>
            </CardContent>
          </Card>
        ) : invoices.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <p className="text-center text-muted-foreground">
                No invoices found. Upload your first invoice to get started!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {invoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onAcceptFinancing={handleAcceptFinancing}
                showActions={!isWritePending && !isConfirming}
              />
            ))}
          </div>
        )}
      </div>

      {/* Processing Indicator */}
      {(isWritePending || isConfirming) && (
        <div className="fixed bottom-4 right-4">
          <Card>
            <CardContent className="py-4 px-6">
              <p className="text-sm font-medium">
                {isWritePending && 'Confirming transaction...'}
                {isConfirming && 'Waiting for confirmation...'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
