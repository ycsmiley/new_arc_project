const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ArcPool", function () {
  let arcPool;
  let owner, aegisWallet, lp1, lp2, supplier1, buyer1;
  let invoiceId1;

  beforeEach(async function () {
    [owner, aegisWallet, lp1, lp2, supplier1, buyer1] = await ethers.getSigners();

    // Deploy ArcPool
    const ArcPool = await ethers.getContractFactory("ArcPool");
    arcPool = await ArcPool.deploy(aegisWallet.address);
    await arcPool.waitForDeployment();

    // Generate test invoice ID
    invoiceId1 = ethers.id("INV-2024-001");
  });

  describe("Deployment", function () {
    it("Should set the correct Aegis wallet", async function () {
      expect(await arcPool.aegisServerWallet()).to.equal(aegisWallet.address);
    });

    it("Should grant ADMIN_ROLE to deployer", async function () {
      const ADMIN_ROLE = await arcPool.ADMIN_ROLE();
      expect(await arcPool.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should grant AEGIS_ROLE to Aegis wallet", async function () {
      const AEGIS_ROLE = await arcPool.AEGIS_ROLE();
      expect(await arcPool.hasRole(AEGIS_ROLE, aegisWallet.address)).to.be.true;
    });
  });

  describe("LP Deposits", function () {
    it("Should allow LP to deposit USDC and receive shares", async function () {
      const depositAmount = ethers.parseUnits("10000", 6); // 10,000 USDC

      await expect(
        arcPool.connect(lp1).deposit({ value: depositAmount })
      )
        .to.emit(arcPool, "Deposit")
        .withArgs(lp1.address, depositAmount, depositAmount, depositAmount); // assets, shares, newTotalPoolSize

      // V3: Check share balance instead of lpDeposits
      expect(await arcPool.getLPShareBalance(lp1.address)).to.equal(depositAmount); // 1:1 ratio for first deposit
      expect(await arcPool.balanceOf(lp1.address)).to.equal(depositAmount); // Can also use ERC20 balanceOf
      expect(await arcPool.totalPoolSize()).to.equal(depositAmount);
      expect(await arcPool.availableLiquidity()).to.equal(depositAmount);
    });

    it("Should revert on zero deposit", async function () {
      await expect(
        arcPool.connect(lp1).deposit({ value: 0 })
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should accumulate deposits from multiple LPs", async function () {
      const amount1 = ethers.parseUnits("10000", 6);
      const amount2 = ethers.parseUnits("5000", 6);

      await arcPool.connect(lp1).deposit({ value: amount1 });
      await arcPool.connect(lp2).deposit({ value: amount2 });

      expect(await arcPool.totalPoolSize()).to.equal(amount1 + amount2);
      // V3: Verify total shares minted equals total assets (first deposits)
      expect(await arcPool.totalSupply()).to.equal(amount1 + amount2);
    });
  });

  describe("LP Withdrawals", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseUnits("10000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });
    });

    it("Should allow LP to withdraw assets by burning shares", async function () {
      const withdrawAmount = ethers.parseUnits("5000", 6);
      const initialShares = await arcPool.balanceOf(lp1.address);

      await expect(
        arcPool.connect(lp1).withdrawAssets(withdrawAmount)
      ).to.emit(arcPool, "Withdrawal");

      // V3: Check share balance decreased
      const finalShares = await arcPool.balanceOf(lp1.address);
      expect(finalShares).to.be.lessThan(initialShares);

      // V3: Check asset value is approximately correct (accounting for rounding)
      const assetValue = await arcPool.getLPAssetValue(lp1.address);
      expect(assetValue).to.be.closeTo(
        ethers.parseUnits("5000", 6),
        ethers.parseUnits("1", 6) // 1 USDC tolerance
      );
    });

    it("Should allow LP to redeem specific number of shares", async function () {
      const sharesToRedeem = ethers.parseUnits("5000", 6); // Redeem half the shares
      const initialShares = await arcPool.balanceOf(lp1.address);

      await expect(
        arcPool.connect(lp1).redeemShares(sharesToRedeem)
      ).to.emit(arcPool, "Withdrawal");

      // V3: Verify shares were burned
      expect(await arcPool.balanceOf(lp1.address)).to.equal(initialShares - sharesToRedeem);
    });

    it("Should revert if withdrawal exceeds share balance", async function () {
      const withdrawAmount = ethers.parseUnits("15000", 6);

      await expect(
        arcPool.connect(lp1).withdrawAssets(withdrawAmount)
      ).to.be.revertedWith("Insufficient shares");
    });

    it("Should revert if redeem exceeds share balance", async function () {
      const sharesToRedeem = ethers.parseUnits("15000", 6);

      await expect(
        arcPool.connect(lp1).redeemShares(sharesToRedeem)
      ).to.be.revertedWith("Insufficient shares");
    });

    it("Should revert if withdrawal exceeds available liquidity", async function () {
      const withdrawAmount = ethers.parseUnits("10000", 6);

      // First, do a financing to lock up most of the liquidity
      const payoutAmount = ethers.parseUnits("9000", 6);
      const repaymentAmount = ethers.parseUnits("9200", 6);
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);
      await arcPool
        .connect(supplier1)
        .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature);

      // Now try to withdraw more than available liquidity
      await expect(
        arcPool.connect(lp1).withdrawAssets(withdrawAmount)
      ).to.be.revertedWith("Insufficient pool liquidity");
    });
  });

  describe("Financing", function () {
    beforeEach(async function () {
      // LP deposits liquidity
      const depositAmount = ethers.parseUnits("100000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });
    });

    it("Should allow supplier to withdraw financing with valid signature", async function () {
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("100000", 6); // $2000 interest
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days

      // Create EIP-712 signature (V2 format)
      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);

      // Execute financing
      await expect(
        arcPool
          .connect(supplier1)
          .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature)
      )
        .to.emit(arcPool, "FinancingWithdrawn")
        .withArgs(invoiceId1, supplier1.address, payoutAmount, await time.latest());

      // Verify state changes
      expect(await arcPool.usedInvoices(invoiceId1)).to.be.true;
      expect(await arcPool.availableLiquidity()).to.equal(
        ethers.parseUnits("2000", 6) // 100,000 - 98,000
      );

      // Verify financing record
      const record = await arcPool.financingRecords(invoiceId1);
      expect(record.payoutAmount).to.equal(payoutAmount);
      expect(record.repaymentAmount).to.equal(repaymentAmount);
      expect(record.dueDate).to.equal(dueDate);
      expect(record.repaid).to.be.false;
    });

    it("Should revert on expired signature", async function () {
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("100000", 6);
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago (EXPIRED)
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);

      await expect(
        arcPool
          .connect(supplier1)
          .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature)
      ).to.be.revertedWith("Signature expired");
    });

    it("Should revert on invalid signature", async function () {
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("100000", 6);
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      // Use wrong signer
      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await owner.signTypedData(domain, types, value); // Wrong signer!

      await expect(
        arcPool
          .connect(supplier1)
          .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature)
      ).to.be.revertedWith("Invalid signature");
    });

    it("Should prevent double financing of same invoice", async function () {
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("100000", 6);
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);

      // First financing
      await arcPool
        .connect(supplier1)
        .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature);

      // Try to finance again
      await expect(
        arcPool
          .connect(supplier1)
          .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature)
      ).to.be.revertedWith("Invoice already financed");
    });

    it("Should validate repayment amount is greater than payout", async function () {
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("98000", 6); // Same as payout (invalid)
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);

      await expect(
        arcPool
          .connect(supplier1)
          .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature)
      ).to.be.revertedWith("Repayment must be greater than payout");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to update Aegis wallet", async function () {
      const newAegisWallet = lp2.address;

      await expect(
        arcPool.connect(owner).updateAegisWallet(newAegisWallet)
      )
        .to.emit(arcPool, "AegisWalletUpdated")
        .withArgs(aegisWallet.address, newAegisWallet);

      expect(await arcPool.aegisServerWallet()).to.equal(newAegisWallet);
    });

    it("Should revert if non-admin tries to update Aegis wallet", async function () {
      await expect(
        arcPool.connect(lp1).updateAegisWallet(lp2.address)
      ).to.be.reverted;
    });
  });

  describe("V3 Profit Distribution (Share Appreciation)", function () {
    it("Should automatically appreciate LP shares when interest is earned", async function () {
      // LP1 deposits 100,000 USDC
      const depositAmount = ethers.parseUnits("100000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });

      // Initial state: 1:1 ratio
      expect(await arcPool.balanceOf(lp1.address)).to.equal(depositAmount);
      expect(await arcPool.getLPAssetValue(lp1.address)).to.equal(depositAmount);

      // Finance an invoice
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("100000", 6); // $2000 interest
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);
      await arcPool
        .connect(supplier1)
        .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature);

      // Repay the invoice with interest
      await arcPool.connect(buyer1).repay(invoiceId1, { value: repaymentAmount });

      // V3 KEY TEST: LP's share balance hasn't changed
      expect(await arcPool.balanceOf(lp1.address)).to.equal(depositAmount);

      // BUT: LP's asset value has increased due to interest
      const lpInterest = (ethers.parseUnits("2000", 6) * 9000n) / 10000n; // 90% of $2000 interest
      const expectedAssetValue = depositAmount + lpInterest;

      const actualAssetValue = await arcPool.getLPAssetValue(lp1.address);
      expect(actualAssetValue).to.equal(expectedAssetValue);

      // Verify share price increased
      const sharePrice = (await arcPool.totalAssets()) * ethers.parseUnits("1", 18) / await arcPool.totalSupply();
      expect(sharePrice).to.be.greaterThan(ethers.parseUnits("1", 18)); // Greater than 1:1
    });

    it("Should distribute profits proportionally to all LPs", async function () {
      // LP1 deposits 60,000 USDC
      const lp1Deposit = ethers.parseUnits("60000", 6);
      await arcPool.connect(lp1).deposit({ value: lp1Deposit });

      // LP2 deposits 40,000 USDC
      const lp2Deposit = ethers.parseUnits("40000", 6);
      await arcPool.connect(lp2).deposit({ value: lp2Deposit });

      // Total pool: 100,000 USDC
      expect(await arcPool.totalPoolSize()).to.equal(ethers.parseUnits("100000", 6));

      // LP1 has 60% of shares, LP2 has 40%
      const lp1SharesBefore = await arcPool.balanceOf(lp1.address);
      const lp2SharesBefore = await arcPool.balanceOf(lp2.address);

      // Finance and repay
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("100000", 6); // $2000 interest
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);
      await arcPool
        .connect(supplier1)
        .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature);

      await arcPool.connect(buyer1).repay(invoiceId1, { value: repaymentAmount });

      // V3: Shares haven't changed
      expect(await arcPool.balanceOf(lp1.address)).to.equal(lp1SharesBefore);
      expect(await arcPool.balanceOf(lp2.address)).to.equal(lp2SharesBefore);

      // But asset values increased proportionally
      const lp1AssetValue = await arcPool.getLPAssetValue(lp1.address);
      const lp2AssetValue = await arcPool.getLPAssetValue(lp2.address);

      // LP1 should have more than their initial deposit
      expect(lp1AssetValue).to.be.greaterThan(lp1Deposit);
      // LP2 should have more than their initial deposit
      expect(lp2AssetValue).to.be.greaterThan(lp2Deposit);

      // Profit should be distributed 60:40
      const lp1Profit = lp1AssetValue - lp1Deposit;
      const lp2Profit = lp2AssetValue - lp2Deposit;

      // Check ratio is approximately 60:40 (allowing for rounding)
      const ratio = (lp1Profit * 10000n) / lp2Profit;
      expect(ratio).to.be.closeTo(15000n, 100n); // 1.5 ratio (60/40) with tolerance
    });

    it("Should give later LPs correct share amount based on current pool value", async function () {
      // LP1 deposits 100,000 USDC initially
      const lp1InitialDeposit = ethers.parseUnits("100000", 6);
      await arcPool.connect(lp1).deposit({ value: lp1InitialDeposit });

      // Finance and repay to generate profit
      const payoutAmount = ethers.parseUnits("98000", 6);
      const repaymentAmount = ethers.parseUnits("100000", 6);
      const nonce = Date.now();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const dueDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const domain = {
        name: "ArcPool",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await arcPool.getAddress(),
      };

      const types = {
        FinancingRequest: [
          { name: "invoiceId", type: "bytes32" },
          { name: "supplier", type: "address" },
          { name: "payoutAmount", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        invoiceId: invoiceId1,
        supplier: supplier1.address,
        payoutAmount: payoutAmount,
        repaymentAmount: repaymentAmount,
        dueDate: dueDate,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await aegisWallet.signTypedData(domain, types, value);
      await arcPool
        .connect(supplier1)
        .withdrawFinancing(invoiceId1, payoutAmount, repaymentAmount, dueDate, nonce, deadline, signature);

      await arcPool.connect(buyer1).repay(invoiceId1, { value: repaymentAmount });

      // Now pool has grown due to interest
      const totalAssetsAfterInterest = await arcPool.totalAssets();
      expect(totalAssetsAfterInterest).to.be.greaterThan(lp1InitialDeposit);

      // LP2 deposits same amount as LP1 initially did
      const lp2Deposit = ethers.parseUnits("100000", 6);
      await arcPool.connect(lp2).deposit({ value: lp2Deposit });

      // V3: LP2 should receive FEWER shares than LP1 because pool value is higher
      const lp1Shares = await arcPool.balanceOf(lp1.address);
      const lp2Shares = await arcPool.balanceOf(lp2.address);
      expect(lp2Shares).to.be.lessThan(lp1Shares);

      // But both should have same asset value
      const lp1Assets = await arcPool.getLPAssetValue(lp1.address);
      const lp2Assets = await arcPool.getLPAssetValue(lp2.address);
      expect(lp1Assets).to.be.closeTo(lp2Assets, ethers.parseUnits("1", 6)); // Allow 1 USDC tolerance
    });
  });

  describe("View Functions", function () {
    it("Should return correct pool status", async function () {
      const depositAmount = ethers.parseUnits("50000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });

      const status = await arcPool.getPoolStatus();
      expect(status[0]).to.equal(depositAmount); // total
      expect(status[1]).to.equal(depositAmount); // available
      expect(status[2]).to.equal(0); // utilized
      expect(status[3]).to.equal(0); // financed
    });

    it("Should return correct LP share balance", async function () {
      const depositAmount = ethers.parseUnits("10000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });

      // V3: Use getLPShareBalance instead of getLPBalance
      expect(await arcPool.getLPShareBalance(lp1.address)).to.equal(depositAmount);
      expect(await arcPool.balanceOf(lp1.address)).to.equal(depositAmount); // Also test ERC20 method
    });

    it("Should return correct LP asset value", async function () {
      const depositAmount = ethers.parseUnits("10000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });

      // V3: Test getLPAssetValue
      expect(await arcPool.getLPAssetValue(lp1.address)).to.equal(depositAmount);
    });

    it("Should return correct total assets", async function () {
      const depositAmount = ethers.parseUnits("10000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });

      // V3: Test totalAssets
      expect(await arcPool.totalAssets()).to.equal(depositAmount);
    });

    it("Should calculate shares for assets correctly", async function () {
      const depositAmount = ethers.parseUnits("10000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });

      // V3: Test getSharesForAssets
      const assetsToDeposit = ethers.parseUnits("5000", 6);
      const expectedShares = await arcPool.getSharesForAssets(assetsToDeposit);

      // For 1:1 ratio (no profit yet), shares should equal assets
      expect(expectedShares).to.equal(assetsToDeposit);
    });

    it("Should calculate assets for shares correctly", async function () {
      const depositAmount = ethers.parseUnits("10000", 6);
      await arcPool.connect(lp1).deposit({ value: depositAmount });

      // V3: Test getAssetsForShares
      const sharesToRedeem = ethers.parseUnits("5000", 6);
      const expectedAssets = await arcPool.getAssetsForShares(sharesToRedeem);

      // For 1:1 ratio (no profit yet), assets should equal shares
      expect(expectedAssets).to.equal(sharesToRedeem);
    });
  });
});

