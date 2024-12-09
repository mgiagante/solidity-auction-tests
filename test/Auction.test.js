const { ethers } = require("hardhat");

let expect;
let solidity;

before(async () => {
  const chaiModule = await import('chai');
  expect = chaiModule.expect;

  const waffleModule = await import('ethereum-waffle');
  solidity = waffleModule.solidity;

  chaiModule.use(solidity);
});

describe("SimpleAuction Contract", function () {
  const ONE_ETHER = ethers.BigNumber.from(10).pow(18);
  const toTokens = (amount) => ethers.BigNumber.from(amount).mul(ONE_ETHER);
  const toWei = (amount) => ethers.utils.parseEther(amount.toString());
  const calculatePayment = (tokens, price) => toTokens(tokens).mul(price);

  let owner, bidder1, bidder2, bidder3, user, auction, token;

  beforeEach(async function () {
    // Get signers
    [owner, bidder1, bidder2, bidder3, user] = await ethers.getSigners();

    // Deploy the SimpleAuctionToken (ERC20 token) contract
    const Token = await ethers.getContractFactory("SimpleAuctionToken");
    token = await Token.deploy();
    await token.deployed();

    // Deploy the SimpleAuction contract, passing the token address
    const Auction = await ethers.getContractFactory("SimpleAuction");
    auction = await Auction.deploy(token.address); // Pass the token address to the auction contract
    await auction.deployed();

    // Transfer some tokens to the auction contract to start the auction
    const amountToTransfer = toTokens(1000);
    await token.transfer(auction.address, amountToTransfer); // Transfer tokens to the auction contract
  });

  describe("Token Balance", function () {
    it("should show the correct token balance after starting an auction", async function () {
      await auction.startAuction(toTokens(100), 1);
      const balance = await auction.getTokenBalance();
      expect(balance).to.eql(toWei(1000));
    });
  });

  describe("Ending auction too early", function () {
    it("should revert if Owner ends the auction before time limit", async function () {
      await auction.startAuction(toTokens(100), 24);
      await expect(auction.endTokensAuction()).to.be.revertedWith("Auction deadline has not yet been reached.");
    });

    it("should revert if non-owner ends the auction too early", async function () {
      await auction.startAuction(toTokens(100), 24);
      await expect(auction.connect(user).endTokensAuction()).to.be.revertedWith("Auction deadline has not yet been reached.");
    });
  });

  describe("Ending an auction that has not started", function () {
    it("should revert if Owner tries to end a non-existent auction", async function () {
      await expect(auction.endTokensAuction()).to.be.revertedWith("Auction has already ended.");
    });

    it("should revert if non-owner tries to end a non-existent auction", async function () {
      await expect(auction.connect(user).endTokensAuction()).to.be.revertedWith("Auction has already ended.");
    });
  });

  describe("Auction happy path", function () {
    it("should fulfill bids correctly when auction ends", async function () {
      await auction.startAuction(toTokens(100), 1);

      await auction.connect(bidder1).bidForTokens(
        toWei(25), // 25 tokens in wei
        5, 
        { value: ethers.BigNumber.from(25).mul(ethers.BigNumber.from(5)).mul(ONE_ETHER) }
      );

      await auction.connect(bidder2).bidForTokens(
        toWei(50), // 50 tokens in wei
        3, 
        { value: ethers.BigNumber.from(50).mul(ethers.BigNumber.from(3)).mul(ONE_ETHER) }
      );

      await ethers.provider.send("evm_increaseTime", [3600]); // Simulate 1 hour passing
      await auction.endTokensAuction();

      // Get the total token balance of the auction contract
      const totalBalance = await auction.getTokenBalance();

      // Expected balance calculation
      const initialBalance = toWei(1000);
      const fulfilledTokens = toWei(75); // 25 + 50 tokens in wei
      const expectedBalance = initialBalance.sub(fulfilledTokens);

      expect(totalBalance).to.eql(expectedBalance);
    });
  });

  describe("Partial refunds", function () {
    it("should refund partially fulfilled bids correctly", async function () {
      // Start the auction with 100 tokens, price per token starts at 24
      await auction.startAuction(toTokens(100), 1);

      // First bid: 50 tokens @ 5 ETH each
      await auction.connect(bidder1).bidForTokens(
        toWei(50), // 50 tokens in wei
        5, 
        { value: calculatePayment(50, 5) } // 50 tokens * 5 ETH per token
      );

      // Second bid: 55 tokens @ 3 ETH each
      await auction.connect(bidder2).bidForTokens(
        toWei(55), // 55 tokens in wei
        3, 
        { value: calculatePayment(55, 3) } // 55 tokens * 3 ETH per token
      );

      // Simulate 1 hour passing and end the auction
      await ethers.provider.send("evm_increaseTime", [3600]);
      await auction.endTokensAuction();

      // Verify all tokens are allocated
      const balance = await auction.getTokenBalance();
      expect(toWei(100).add(balance)).to.eql(toWei(1000)); // All tokens allocated
       
      // Verify partial refund for the second bidder
      expect(auction.connect(bidder2).withdrawUnsuccessfulBids()).not.to.be.reverted
    });
  });

  describe("Mixed fulfillment and refunds", function () {
    it("should handle mixed bid fulfillment and refunds correctly", async function () {
      await auction.startAuction(toTokens(60), 1);

      await auction.connect(bidder1).bidForTokens(
        toWei(20), // 20 tokens @ 10 ETH
        10, 
        { value: calculatePayment(20, 10) }
      );
      await auction.connect(bidder2).bidForTokens(
        toWei(20), // 20 tokens @ 8 ETH
        8, 
        { value: calculatePayment(20, 8) }
      );
      await auction.connect(bidder3).bidForTokens(
        toWei(25), // 25 tokens @ 5 ETH
        5, 
        { value: calculatePayment(25, 5) }
      );

      await ethers.provider.send("evm_increaseTime", [3600 * 2]); // Simulate time passing
      await auction.endTokensAuction();

      const balance = await auction.getTokenBalance();
      expect(balance).to.equal(toTokens(940)); // All tokens allocated

      const initialBalance = await ethers.provider.getBalance(bidder3.address);

      const tx = await auction.connect(bidder3).withdrawUnsuccessfulBids();

      const finalBalance = await ethers.provider.getBalance(bidder3.address); // Check bidder3's balance after withdrawal
      const refundAmount = toWei(25);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
       
      // Assert bidder3's balance increased by 25 ETH, including gas costs for withdrawing.
      expect(finalBalance.sub(initialBalance).add(gasUsed)).to.eql(refundAmount);
    });
  });

  describe("Overbidding by a Single Bidder", function () {
    it("should fulfill the maximum tokens and refund the rest", async function () {
      await auction.startAuction(toTokens(100), 1);

      await auction.connect(bidder1).bidForTokens(
        toWei(150), // 150 tokens in wei for 5 ETH
        5, 
        { value: calculatePayment(150, 5) }
      );

      await ethers.provider.send("evm_increaseTime", [3600]); // Simulate time passing
      await auction.endTokensAuction();

      const balance = await auction.getTokenBalance();
      expect(balance).to.eql(toTokens(900)); // All tokens allocated

      expect(auction.connect(bidder1).withdrawUnsuccessfulBids()).not.to.be.reverted
    });
  });

  describe("Auction Ends With No Tokens Available", function () {
    it("should revert if auction is started with no tokens", async function () {
      await expect(
          auction.startAuction(toTokens(0), 1)
      ).to.be.revertedWith("Amount must be  greater than 0.");
    });
  });

  describe("Auction Ends With Unfulfilled Tokens", function () {
    it("should leave unclaimed tokens if not all are bid for", async function () {
      await auction.startAuction(toTokens(100), 1);

      await auction.connect(bidder1).bidForTokens(
        toWei(50), // 50 tokens in wei for 5 ETH
        5, 
        { value: calculatePayment(50, 5) }
      );

      await ethers.provider.send("evm_increaseTime", [3600]); // Simulate time passing
      await auction.endTokensAuction();

      const balance = await auction.getTokenBalance();
      expect(balance).to.eql(toTokens(950)); // 100 - 50 = 50 tokens left
    });
  });

  describe("Multiple Bidders With Same Price", function () {
    it("should allocate tokens fairly among bidders with the same price", async function () {
      await auction.startAuction(toTokens(100), 1);

      await auction.connect(bidder1).bidForTokens(
        toWei(30), // 30 tokens in wei for 5 ETH
        5, 
        { value: calculatePayment(30, 5) }
      );
      await auction.connect(bidder2).bidForTokens(
        toWei(40), // 40 tokens in wei for 5 ETH
        5, 
        { value: calculatePayment(40, 5) }
      );
      await auction.connect(bidder3).bidForTokens(
        toWei(50), // 40 tokens in wei for 5 ETH
        5, 
        { value: calculatePayment(50, 5) }
      );

      await ethers.provider.send("evm_increaseTime", [3600]); // Simulate time passing
      await auction.endTokensAuction();

      const bidderAllocations = await auction.getBidsAtPrice(5);

      expect(bidderAllocations[0].bidder).to.eql(bidder1.address);
      expect(bidderAllocations[1].bidder).to.eql(bidder2.address);
      expect(bidderAllocations[2].bidder).to.eql(bidder3.address);
    });
  });

  describe("Bids Placed After Auction Ends", function () {
    it("should revert if a bid is placed after the auction ends", async function () {
      await auction.startAuction(toTokens(100), 1);

      await ethers.provider.send("evm_increaseTime", [3600 * 2]);
      await auction.endTokensAuction();

      await expect(
        auction.connect(bidder1).bidForTokens(
          toWei(30), // 30 tokens in wei for 5 ETH
          5, 
          { value: calculatePayment(30, 5) }
        )
      ).to.be.revertedWith("Auction for tokens has ended.");
    });
  });

  describe("Auction Ends With No Payment", function () {
    it("should leave token balance untouched if no bids are placed", async function () {
      await auction.startAuction(toTokens(100), 1);

      await ethers.provider.send("evm_increaseTime", [3600 * 2]);
      await auction.endTokensAuction();

      const balance = await auction.getTokenBalance();
      expect(balance).to.eql(toTokens(1000));
    });
  });
});
