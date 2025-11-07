'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database } from "@/lib/supabase/types";

type Invoice = Database['public']['Tables']['invoices']['Row'];

interface InvoiceCardProps {
  invoice: Invoice;
  onAcceptFinancing?: (invoice: Invoice) => void;
  showActions?: boolean;
}

export function InvoiceCard({ invoice, onAcceptFinancing, showActions = true }: InvoiceCardProps) {
  const signatureData = invoice.aegis_signature
    ? JSON.parse(invoice.aegis_signature)
    : null;

  // Calculate interest
  const interest = signatureData && invoice.aegis_payout_offer
    ? signatureData.repaymentAmount - invoice.aegis_payout_offer
    : 0;

  const interestRate = signatureData && invoice.aegis_payout_offer
    ? ((interest / invoice.aegis_payout_offer) * 100).toFixed(2)
    : '0.00';

  // Calculate due date
  const dueDate = signatureData
    ? new Date(signatureData.dueDate * 1000)
    : null;

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FINANCED':
        return 'bg-blue-100 text-blue-800';
      case 'PAID':
        return 'bg-gray-100 text-gray-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle>Invoice #{invoice.invoice_number}</CardTitle>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
            {invoice.status}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Invoice Amount */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice Amount:</span>
            <span className="font-semibold">
              ${invoice.amount.toLocaleString()} {invoice.currency}
            </span>
          </div>

          {/* You Receive (Payout) */}
          {invoice.aegis_payout_offer && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">You Receive Now:</span>
              <span className="font-semibold text-green-600">
                ${invoice.aegis_payout_offer.toLocaleString()} {invoice.currency}
              </span>
            </div>
          )}

          {/* Interest (NEW) */}
          {interest > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Interest Cost:</span>
              <span>
                ${interest.toLocaleString()} {invoice.currency} ({interestRate}%)
              </span>
            </div>
          )}

          {/* Due Date (NEW) */}
          {dueDate && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Repayment Due:</span>
              <span>{dueDate.toLocaleDateString()}</span>
            </div>
          )}

          {/* Repayment Amount (NEW) */}
          {signatureData && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Repayment:</span>
              <span className="font-medium">
                ${signatureData.repaymentAmount.toLocaleString()} {invoice.currency}
              </span>
            </div>
          )}

          {/* Original Due Date */}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Invoice Due:</span>
            <span>{new Date(invoice.due_date).toLocaleDateString()}</span>
          </div>

          {/* Action Button */}
          {showActions && invoice.status === 'APPROVED' && onAcceptFinancing && invoice.aegis_payout_offer && (
            <Button
              onClick={() => onAcceptFinancing(invoice)}
              className="w-full mt-4"
            >
              Accept Financing & Receive ${invoice.aegis_payout_offer.toLocaleString()} Now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
