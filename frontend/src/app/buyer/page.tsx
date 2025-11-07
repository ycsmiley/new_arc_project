'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/types';
import { BuyerRepayment } from '@/components/BuyerRepayment';
import { InvoiceCard } from '@/components/InvoiceCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Invoice = Database['public']['Tables']['invoices']['Row'];

export default function BuyerPortal() {
  const { address, isConnected } = useAccount();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const contractAddress = process.env.NEXT_PUBLIC_ARC_CONTRACT_ADDRESS as `0x${string}` || '0x';

  useEffect(() => {
    loadInvoices();
  }, [address]);

  const loadInvoices = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // In production, you would filter by buyer_id based on user profile
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

  const pendingInvoices = invoices.filter((i) => i.status === 'PENDING');
  const approvedInvoices = invoices.filter((i) => i.status === 'APPROVED');
  const financedInvoices = invoices.filter((i) => i.status === 'FINANCED');
  const paidInvoices = invoices.filter((i) => i.status === 'PAID');

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Card>
          <CardContent className="py-16">
            <p className="text-center text-xl text-muted-foreground">
              Please connect your wallet to access the Buyer Portal
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Buyer Portal</h1>
        <p className="text-muted-foreground">
          Approve invoices and manage repayments
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">
              {pendingInvoices.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {approvedInvoices.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Awaiting Repayment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {financedInvoices.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-600">
              {paidInvoices.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different invoice states */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">
            Pending ({pendingInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approvedInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="financed">
            Repayment ({financedInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="paid">
            Paid ({paidInvoices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {isLoading ? (
            <Card>
              <CardContent className="py-16">
                <p className="text-center text-muted-foreground">Loading...</p>
              </CardContent>
            </Card>
          ) : pendingInvoices.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <p className="text-center text-muted-foreground">
                  No pending invoices
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingInvoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          {approvedInvoices.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <p className="text-center text-muted-foreground">
                  No approved invoices
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {approvedInvoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="financed" className="mt-6">
          {financedInvoices.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <p className="text-center text-muted-foreground">
                  No invoices awaiting repayment
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {financedInvoices.map((invoice) => (
                <BuyerRepayment
                  key={invoice.id}
                  invoiceId={invoice.id}
                  contractAddress={contractAddress}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="paid" className="mt-6">
          {paidInvoices.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <p className="text-center text-muted-foreground">
                  No paid invoices
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {paidInvoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
