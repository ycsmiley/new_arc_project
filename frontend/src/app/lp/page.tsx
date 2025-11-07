'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { LPDashboard } from '@/components/LPDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ArcPoolABI from '@/contracts/ArcPool.json';

export default function LPPortal() {
  const { address, isConnected } = useAccount();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const contractAddress = process.env.NEXT_PUBLIC_ARC_CONTRACT_ADDRESS as `0x${string}` || '0x';

  // Read LP balance
  const { data: lpBalanceData } = useReadContract({
    address: contractAddress,
    abi: ArcPoolABI,
    functionName: 'getLPBalance',
    args: address ? [address] : undefined,
  });

  const lpBalance = lpBalanceData
    ? Number(formatUnits(lpBalanceData as bigint, 6))
    : 0;

  // Deposit contract write
  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: isDepositPending,
    error: depositError
  } = useWriteContract();

  // Withdraw contract write
  const {
    writeContract: writeWithdraw,
    data: withdrawHash,
    isPending: isWithdrawPending,
    error: withdrawError
  } = useWriteContract();

  // Wait for deposit confirmation
  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  // Wait for withdraw confirmation
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      return;
    }

    try {
      const amountInWei = parseUnits(depositAmount, 6);

      writeDeposit({
        address: contractAddress,
        abi: ArcPoolABI,
        functionName: 'deposit',
        value: amountInWei,
      });

      setDepositAmount('');
    } catch (error) {
      console.error('Deposit error:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      return;
    }

    try {
      const amountInWei = parseUnits(withdrawAmount, 6);

      writeWithdraw({
        address: contractAddress,
        abi: ArcPoolABI,
        functionName: 'withdraw',
        args: [amountInWei],
      });

      setWithdrawAmount('');
    } catch (error) {
      console.error('Withdraw error:', error);
    }
  };

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Card>
          <CardContent className="py-16">
            <p className="text-center text-xl text-muted-foreground">
              Please connect your wallet to access the LP Portal
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Liquidity Provider Portal</h1>
        <p className="text-muted-foreground">
          Deposit USDC to earn interest from supply chain financing
        </p>
      </div>

      {/* Success/Error Alerts */}
      {isDepositSuccess && (
        <Alert className="mb-6">
          <AlertDescription>
            ✓ Deposit successful! Transaction: {depositHash?.slice(0, 10)}...
          </AlertDescription>
        </Alert>
      )}

      {isWithdrawSuccess && (
        <Alert className="mb-6">
          <AlertDescription>
            ✓ Withdrawal successful! Transaction: {withdrawHash?.slice(0, 10)}...
          </AlertDescription>
        </Alert>
      )}

      {depositError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>Deposit error: {depositError.message}</AlertDescription>
        </Alert>
      )}

      {withdrawError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>Withdraw error: {withdrawError.message}</AlertDescription>
        </Alert>
      )}

      {/* LP Balance */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Your LP Position</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold">${lpBalance.toLocaleString()}</p>
            <p className="text-muted-foreground">USDC deposited</p>
          </div>
        </CardContent>
      </Card>

      {/* Deposit/Withdraw Controls */}
      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Deposit USDC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount (USDC)</Label>
              <Input
                id="deposit-amount"
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={isDepositPending || isDepositConfirming}
              />
            </div>
            <Button
              onClick={handleDeposit}
              disabled={
                !depositAmount ||
                parseFloat(depositAmount) <= 0 ||
                isDepositPending ||
                isDepositConfirming
              }
              className="w-full"
            >
              {isDepositPending || isDepositConfirming
                ? 'Processing...'
                : 'Deposit'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Withdraw USDC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount (USDC)</Label>
              <Input
                id="withdraw-amount"
                type="number"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isWithdrawPending || isWithdrawConfirming}
              />
              <p className="text-xs text-muted-foreground">
                Available to withdraw: ${lpBalance.toLocaleString()} USDC
              </p>
            </div>
            <Button
              onClick={handleWithdraw}
              disabled={
                !withdrawAmount ||
                parseFloat(withdrawAmount) <= 0 ||
                isWithdrawPending ||
                isWithdrawConfirming
              }
              variant="outline"
              className="w-full"
            >
              {isWithdrawPending || isWithdrawConfirming
                ? 'Processing...'
                : 'Withdraw'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Pool Dashboard */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Pool Overview</h2>
        <LPDashboard contractAddress={contractAddress} />
      </div>

      {/* Info Section */}
      <Card className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Earn Interest:</strong> Your deposited USDC is used to finance supplier invoices.
            When buyers repay, you earn 90% of the interest.
          </p>
          <p>
            <strong>Liquidity:</strong> Withdraw your funds anytime, subject to available pool liquidity.
          </p>
          <p>
            <strong>Interest Calculation:</strong> Interest is calculated based on the financing rates
            offered by Aegis AI, which factors in buyer creditworthiness and invoice terms.
          </p>
          <p className="text-muted-foreground pt-2">
            Note: All transactions use Arc's native USDC. Gas fees are paid in USDC automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
