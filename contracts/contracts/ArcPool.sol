// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
// [V3 CHANGE] Import ERC20. The contract itself will be the LP share token.
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ArcPool - Arc Chain Native Supply Chain Finance Pool
 * @notice On Arc, gas is paid in USDC, simplifying the entire flow
 * @dev V3 - Implements an ERC-4626-like tokenized vault model.
 * The vault itself is the ERC20 share token (the asset is native USDC).
 */
// [V3 CHANGE] Contract now inherits from ERC20
contract ArcPool is ReentrancyGuard, AccessControl, EIP712, ERC20 {
    using ECDSA for bytes32;

    // ============ Role Definitions ============
    bytes32 public constant AEGIS_ROLE = keccak256("AEGIS_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ============ State Variables ============
    address public aegisServerWallet;

    // [V3 CHANGE] totalPoolSize now represents the total assets (USDC) managed by the vault.
    uint256 public totalPoolSize;
    uint256 public availableLiquidity;
    uint256 public totalFinanced;
    uint256 public totalInterestEarned;
    uint256 public protocolFeeRate = 1000; // 10% of interest (basis points)
    address public protocolFeeReceiver;

    // Track used invoices
    mapping(bytes32 => bool) public usedInvoices;
    // [V3 CHANGE] lpDeposits mapping is removed.
    // The ERC20 `balanceOf(address)` now tracks each LP's shares.
    mapping(bytes32 => FinancingRecord) public financingRecords;

    // ============ Structs ============
    struct FinancingRecord {
        bytes32 invoiceId;
        address supplier;
        uint256 payoutAmount;       // Amount paid to supplier
        uint256 repaymentAmount;    // Amount that must be repaid (includes interest)
        uint256 dueDate;            // Repayment due date
        uint256 timestamp;          // Financing timestamp
        bool repaid;
    }

    // ============ Events ============
    // [V3 CHANGE] Events are updated to include 'shares'
    event Deposit(address indexed user, uint256 assets, uint256 shares, uint256 newTotalPoolSize);
    event Withdrawal(address indexed user, uint256 assets, uint256 shares, uint256 newTotalPoolSize);

    event FinancingWithdrawn(
        bytes32 indexed invoiceId,
        address indexed supplier,
        uint256 amount,
        uint256 timestamp
    );
    event Repayment(
        bytes32 indexed invoiceId,
        address indexed payer,
        uint256 amount,
        uint256 interest,
        uint256 lateFee
    );
    event InterestDistributed(uint256 lpShare, uint256 protocolShare);
    event AegisWalletUpdated(address indexed oldWallet, address indexed newWallet);

    // ============ Constructor ============
    constructor(address _aegisServerWallet)
        // [V3 CHANGE] Initialize the ERC20 share token
        ERC20("ArcPool LP Share", "arcLP")
        EIP712("ArcPool", "1")
        payable
    {
        require(_aegisServerWallet != address(0), "Invalid Aegis wallet");
        aegisServerWallet = _aegisServerWallet;
        protocolFeeReceiver = msg.sender; // Default to deployer

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(AEGIS_ROLE, _aegisServerWallet);

        // If deployed with initial liquidity
        if (msg.value > 0) {
            uint256 assets = msg.value;
            totalPoolSize = assets;
            availableLiquidity = assets;
            // [V3 CHANGE] Mint initial shares (1:1) to the deployer
            _mint(msg.sender, assets);
            emit Deposit(msg.sender, assets, assets, totalPoolSize);
        }
    }

    // ============ LP Functions (V3 Tokenized Model) ============

    /**
     * @notice LP deposits USDC (native token) and receives shares
     * @dev This is the `deposit` function in an ERC-4626 model
     */
    function deposit() external payable nonReentrant {
        _processDeposit(msg.sender, msg.value);
    }

    /**
     * @notice LP redeems (burns) a specific amount of shares to withdraw USDC
     * @dev This is the `redeem` function in an ERC-4626 model
     * @param shares Amount of shares to redeem
     */
    function redeemShares(uint256 shares) external nonReentrant {
        require(shares > 0, "Shares must be greater than 0");

        // [V3 CHANGE] Check ERC20 share balance
        uint256 userShares = balanceOf(msg.sender);
        require(shares <= userShares, "Insufficient shares");

        // Calculate how many assets these shares are worth
        uint256 assets = getAssetsForShares(shares);
        require(assets > 0, "Shares must be worth more than 0 assets");
        require(assets <= availableLiquidity, "Insufficient pool liquidity");

        // 1. Burn the shares
        _burn(msg.sender, shares);

        // 2. Update pool state
        totalPoolSize -= assets;
        availableLiquidity -= assets;

        // 3. Send the USDC
        _transferNativeUSDC(msg.sender, assets);

        emit Withdrawal(msg.sender, assets, shares, totalPoolSize);
    }

    /**
     * @notice LP withdraws a specific amount of USDC, burning the required shares
     * @dev This is the `withdraw` function in an ERC-4626 model
     * @param assets Amount of USDC (assets) to withdraw
     */
    function withdrawAssets(uint256 assets) external nonReentrant {
        require(assets > 0, "Assets must be greater than 0");
        require(assets <= availableLiquidity, "Insufficient pool liquidity");

        // Calculate how many shares are needed to get this many assets
        uint256 shares = getSharesForAssets(assets);
        require(shares > 0, "Assets must be worth more than 0 shares");

        // [V3 CHANGE] Check ERC20 share balance
        uint256 userShares = balanceOf(msg.sender);
        require(shares <= userShares, "Insufficient shares");

        // 1. Burn the shares
        _burn(msg.sender, shares);

        // 2. Update pool state
        totalPoolSize -= assets;
        availableLiquidity -= assets;

        // 3. Send the USDC
        _transferNativeUSDC(msg.sender, assets);

        emit Withdrawal(msg.sender, assets, shares, totalPoolSize);
    }

    // ============ Financing Functions (Logic Unchanged) ============

    /**
     * @notice Supplier withdraws financing with Aegis signature
     * @dev Core financing logic is identical to V2.
     */
    function withdrawFinancing(
        bytes32 invoiceId,
        uint256 payoutAmount,
        uint256 repaymentAmount,
        uint256 dueDate,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) external nonReentrant {
        require(!usedInvoices[invoiceId], "Invoice already financed");
        require(block.timestamp <= deadline, "Signature expired");
        require(payoutAmount <= availableLiquidity, "Insufficient pool liquidity");
        require(repaymentAmount > payoutAmount, "Repayment must be greater than payout");
        require(dueDate > block.timestamp, "Due date must be in the future");

        // Build EIP-712 hash (updated to include repaymentAmount and dueDate)
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("FinancingRequest(bytes32 invoiceId,address supplier,uint256 payoutAmount,uint256 repaymentAmount,uint256 dueDate,uint256 nonce,uint256 deadline)"),
                invoiceId,
                msg.sender,
                payoutAmount,
                repaymentAmount,
                dueDate,
                nonce,
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);

        require(signer == aegisServerWallet, "Invalid signature");

        // Mark invoice as used and update state
        usedInvoices[invoiceId] = true;
        availableLiquidity -= payoutAmount;
        totalFinanced += payoutAmount;

        // Store financing record
        financingRecords[invoiceId] = FinancingRecord({
            invoiceId: invoiceId,
            supplier: msg.sender,
            payoutAmount: payoutAmount,
            repaymentAmount: repaymentAmount,
            dueDate: dueDate,
            timestamp: block.timestamp,
            repaid: false
        });

        // Transfer USDC to supplier
        _transferNativeUSDC(msg.sender, payoutAmount);

        emit FinancingWithdrawn(invoiceId, msg.sender, payoutAmount, block.timestamp);
    }

    /**
     * @notice Repay financed invoice with interest
     * @dev This function's logic is the V3 engine.
     * It increases totalPoolSize (assets) without increasing totalSupply (shares),
     * which makes each share worth more.
     */
    function repay(bytes32 invoiceId) external payable nonReentrant {
        FinancingRecord storage record = financingRecords[invoiceId];

        require(usedInvoices[invoiceId], "Invoice not financed");
        require(!record.repaid, "Already repaid");

        // Calculate late fee (same as V2)
        uint256 requiredAmount = record.repaymentAmount;
        uint256 lateFee = 0;

        if (block.timestamp > record.dueDate) {
            uint256 daysLate = (block.timestamp - record.dueDate) / 1 days;
            lateFee = (record.repaymentAmount * daysLate * 100) / 10000; // 1% per day
            uint256 maxLateFee = (record.repaymentAmount * 3000) / 10000; // Cap at 30%
            if (lateFee > maxLateFee) lateFee = maxLateFee;
            requiredAmount += lateFee;
        }

        require(msg.value >= requiredAmount, "Insufficient repayment amount");

        // Calculate interest and fees (same as V2)
        uint256 baseInterest = record.repaymentAmount - record.payoutAmount;
        uint256 totalInterest = baseInterest + lateFee;

        uint256 protocolFee = (totalInterest * protocolFeeRate) / 10000;
        uint256 lpInterest = totalInterest - protocolFee;

        // Mark as repaid
        record.repaid = true;

        // [V3 KEY LOGIC]
        // 1. Add principal + LP's interest back to available liquidity
        availableLiquidity += record.payoutAmount + lpInterest;
        // 2. Add *only* the LP's interest to the totalPoolSize
        // This increases the total assets (totalPoolSize) without minting
        // new shares, thus increasing the value of all existing shares.
        totalPoolSize += lpInterest;
        totalInterestEarned += totalInterest;

        // Transfer protocol fee
        if (protocolFee > 0) {
            _transferNativeUSDC(protocolFeeReceiver, protocolFee);
        }

        // Refund excess payment
        if (msg.value > requiredAmount) {
            _transferNativeUSDC(msg.sender, msg.value - requiredAmount);
        }

        emit Repayment(invoiceId, msg.sender, msg.value, totalInterest, lateFee);
        emit InterestDistributed(lpInterest, protocolFee);
    }

    // ============ Admin Functions (Logic Unchanged) ============

    function updateAegisWallet(address newWallet) external onlyRole(ADMIN_ROLE) {
        require(newWallet != address(0), "Invalid wallet address");
        address oldWallet = aegisServerWallet;
        aegisServerWallet = newWallet;

        revokeRole(AEGIS_ROLE, oldWallet);
        grantRole(AEGIS_ROLE, newWallet);

        emit AegisWalletUpdated(oldWallet, newWallet);
    }

    function updateProtocolFeeRate(uint256 newRate) external onlyRole(ADMIN_ROLE) {
        require(newRate <= 5000, "Fee rate cannot exceed 50%");
        protocolFeeRate = newRate;
    }

    function updateProtocolFeeReceiver(address newReceiver) external onlyRole(ADMIN_ROLE) {
        require(newReceiver != address(0), "Invalid receiver address");
        protocolFeeReceiver = newReceiver;
    }

    // ============ View Functions (V3 Updated) ============

    /**
     * @notice Get pool status
     */
    function getPoolStatus() external view returns (
        uint256 total,
        uint256 available,
        uint256 utilized,
        uint256 financed
    ) {
        return (
            totalPoolSize,
            availableLiquidity,
            totalPoolSize - availableLiquidity,
            totalFinanced
        );
    }

    /**
     * @notice Get LP's *share* balance
     * @param lp LP address
     * @return Share balance
     */
    function getLPShareBalance(address lp) external view returns (uint256) {
        // [V3 CHANGE] Returns share balance from ERC20
        return balanceOf(lp);
    }

    /**
     * @notice Get the *asset value* (USDC) of an LP's shares
     * @param lp LP address
     * @return USDC asset value
     */
    function getLPAssetValue(address lp) external view returns (uint256) {
        uint256 shares = balanceOf(lp);
        if (shares == 0) return 0;
        return getAssetsForShares(shares);
    }

    /**
     * @notice Check if invoice is already financed
     */
    function isInvoiceFinanced(bytes32 invoiceId) external view returns (bool) {
        return usedInvoices[invoiceId];
    }

    /**
     * @notice Get financing record details
     */
    function getFinancingRecord(bytes32 invoiceId) external view returns (FinancingRecord memory) {
        return financingRecords[invoiceId];
    }

    // [V3 CHANGE] ERC-4626 Helper Views

    /**
     * @notice The total amount of assets (USDC) in the pool.
     */
    function totalAssets() external view returns (uint256) {
        return totalPoolSize;
    }

    /**
     * @notice Calculates the amount of shares that would be minted for `assets`
     */
    function getSharesForAssets(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0 || totalPoolSize == 0) {
            return assets; // 1:1 for first deposit
        }
        // Use * then / for better precision
        return (assets * supply) / totalPoolSize;
    }

    /**
     * @notice Calculates the amount of assets `shares` would be redeemed for
     */
    function getAssetsForShares(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0 || totalPoolSize == 0) {
            return shares; // Should not happen if shares > 0, but good failsafe
        }
        // Use * then / for better precision
        return (shares * totalPoolSize) / supply;
    }

    // ============ Fallback & Internal Functions ============

    /**
     * @notice Receive function redirects to deposit()
     */
    receive() external payable {
        // [V3 CHANGE] Redirect to _processDeposit
        _processDeposit(msg.sender, msg.value);
    }

    /**
     * @dev Internal function to process deposits and mint shares
     */
    function _processDeposit(address depositor, uint256 assets) private {
        require(assets > 0, "Amount must be greater than 0");

        // [V3 CHANGE] Calculate shares to mint based on current pool value
        uint256 shares = getSharesForAssets(assets);
        require(shares > 0, "Must mint more than 0 shares");

        // Update state
        totalPoolSize += assets;
        availableLiquidity += assets;

        // Mint LP shares to the depositor
        _mint(depositor, shares);

        emit Deposit(depositor, assets, shares, totalPoolSize);
    }

    /**
     * @dev Internal helper to send native USDC
     */
    function _transferNativeUSDC(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, ) = to.call{value: amount}("");
        require(success, "Native USDC transfer failed");
    }
}
