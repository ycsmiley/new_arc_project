# 交易失敗診斷清單

## 1. 檢查 Pool 流動性
- [ ] LP Portal 顯示的 "Available Liquidity" >= Invoice Amount
- [ ] 如果不足，需要先 Deposit 更多資金

## 2. 檢查簽名數據
在 Supplier Portal 點擊 Accept Offer 前，打開瀏覽器 Console (F12)，執行：
```javascript
// 查看 invoice 數據
console.log('Invoice data:', invoice)
console.log('Payout:', invoice.aegis_payout_offer)
console.log('Repayment:', invoice.aegis_repayment_amount)
console.log('Signature:', invoice.aegis_signature)
console.log('Deadline:', new Date(invoice.aegis_deadline * 1000))
```

## 3. 檢查合約配置
```bash
# 前端
cd frontend
echo "Contract Address:"
grep NEXT_PUBLIC_ARC_CONTRACT_ADDRESS .env.local

# 後端
cd backend
echo "Contract Address:"
grep ARC_CONTRACT_ADDRESS .env
echo "Server Wallet:"
grep SERVER_WALLET_PRIVATE_KEY .env
```

## 4. 檢查區塊鏈 Explorer
1. 複製合約地址
2. 前往 https://explorer.testnet.arc.network/
3. 搜索合約地址
4. 查看：
   - Pool balance
   - Recent transactions
   - Contract state

## 5. 常見錯誤原因

### 錯誤 1: Insufficient Liquidity
**症狀**: 交易 revert，沒有具體錯誤
**原因**: Pool 沒有足夠資金
**解決**: LP 需要先 deposit

### 錯誤 2: Invalid Signature
**症狀**: "Invalid signer" 或 "Signature verification failed"
**原因**: Server wallet 地址不匹配或簽名錯誤
**解決**: 檢查後端 SERVER_WALLET_PRIVATE_KEY

### 錯誤 3: Expired Deadline
**症狀**: "Signature expired"
**原因**: Deadline < 當前時間
**解決**: Deadline 設為 1 小時後（已在代碼中）

### 錯誤 4: Used Nonce
**症狀**: "Nonce already used"
**原因**: 重複使用 nonce
**解決**: 每次生成新 nonce（已在代碼中使用 timestamp）

### 錯誤 5: Invoice Already Financed
**症狀**: "Invoice already processed"
**原因**: Invoice ID 已經被使用過
**解決**: 每個 invoice 只能 finance 一次

## 6. 測試流程

### 完整測試步驟：
```
1. LP Deposit
   ├─ 確認 Available Liquidity > 0
   └─ 記下金額

2. Supplier Create Invoice
   ├─ Amount < Available Liquidity
   └─ 確認收到 AI Pricing

3. Buyer Approve
   ├─ 檢查後端日誌
   └─ 確認生成簽名成功

4. Supplier Accept Offer
   ├─ 打開瀏覽器 Console
   ├─ 查看合約調用參數
   ├─ 確認錢包彈出
   └─ 查看錯誤訊息

5. 如果失敗
   ├─ 複製錢包錯誤訊息
   ├─ 檢查後端日誌
   ├─ 查看區塊鏈 explorer
   └─ 對照上述錯誤原因
```

## 7. Debug Console Commands

在瀏覽器 Console (F12) 執行：

```javascript
// 查看當前 invoice
const invoice = /* 從 React DevTools 獲取 */

// 檢查參數
console.group('Transaction Parameters')
console.log('Invoice Number:', invoice.invoice_number)
console.log('Invoice Hash:', viem.keccak256(viem.stringToHex(invoice.invoice_number)))
console.log('Payout (raw):', invoice.aegis_payout_offer)
console.log('Payout (wei):', viem.parseUnits(invoice.aegis_payout_offer.toString(), 18).toString())
console.log('Repayment (wei):', viem.parseUnits(invoice.aegis_repayment_amount.toString(), 18).toString())
console.log('Due Date (timestamp):', invoice.aegis_due_date)
console.log('Due Date (human):', new Date(invoice.aegis_due_date * 1000).toLocaleString())
console.log('Nonce:', invoice.aegis_nonce)
console.log('Deadline (timestamp):', invoice.aegis_deadline)
console.log('Deadline (human):', new Date(invoice.aegis_deadline * 1000).toLocaleString())
console.log('Signature:', invoice.aegis_signature)
console.groupEnd()

// 檢查 deadline 是否過期
const now = Math.floor(Date.now() / 1000)
const isExpired = invoice.aegis_deadline < now
console.log('Signature expired?', isExpired)
if (isExpired) {
  console.error('❌ Signature expired! Need to regenerate.')
}
```
