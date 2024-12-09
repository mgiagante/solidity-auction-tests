// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title   A simple auction smart contract.
 * @notice  Allows the contract owner to put items up for auction and users to place bids on auction items.
 */
contract SimpleAuction {

    address private owner;
    
    IERC20 public token;

    struct TokenBid {
        uint256 amount;
        uint256 price;
        address bidder;
    }

    uint256 public auctionedTokens;
    bool public auctionInProgress;
    uint256 public auctionEndTime;

    mapping(uint256 => TokenBid[]) bids;
    mapping(uint256 => DoublyLinkedNode) orderedPricesList;
    uint256[] public prices;

    struct DoublyLinkedNode {
        uint256 value;
        uint256 previousNode;
        uint256 nextNode;
    }

    // Holds the unsuccessful bids funds until withdrawals by users.
    mapping(address => uint256) public refunds;

    constructor(address tokenAddress) {
        owner = msg.sender;
        token = IERC20(tokenAddress);
        auctionInProgress = false;
    }

    /**
     * @notice  Starts an auction.
     * @dev     Only callable by the owner.
     * @param   amount  The amount of ERC20 token up for auction.
     * @param   durationInHours  The duration of the auction, in hours.
     */
    function startAuction(uint256 amount, uint256 durationInHours) public {        
        require(owner == msg.sender, "Caller is limited to owner");
        require(amount > 0, "Amount must be  greater than 0.");
        require(token.balanceOf(address(this)) >= amount, "Token balance is too low.");
        require(!auctionInProgress, "An auction is already in progress.");
          
        auctionedTokens = amount;
        auctionEndTime = block.timestamp + (durationInHours * 1 hours);     
        auctionInProgress = true;
    }

    /**
     * @notice  Returns this contract's token balance.
     * @return  uint256  The token balance.
     */
    function getTokenBalance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @notice  Places a user bid on an item.
     * @param   amount  The amount of tokens the bid is for.
     * @param   price  The bid price for a token.
     */
    function bidForTokens(uint256 amount, uint256 price) public payable {
        // Check the bid has not been placed by the owner.
        require(owner != msg.sender, "Only accessible to non-owners.");

        // Check the user has passed enough funds to cover the bid.
        require(msg.value == amount * price, "Not enough funds sent to cover bid.");

        // Check the auction has not ended.
        require(auctionInProgress, "Auction for tokens has ended.");

        TokenBid memory tokenBid = TokenBid({ amount: amount, price: price, bidder: msg.sender});

        // Add this bid to the list of bids at this price, maintaining order.        
        bids[price].push(tokenBid);

        // Insert this price in the list of prices at the right index.
        // If it's the first bid.
        if (orderedPricesList[0].nextNode == 0) {
            orderedPricesList[price] = DoublyLinkedNode({value: price, previousNode: 0, nextNode: 0 });
            orderedPricesList[0] = DoublyLinkedNode({value: 0, previousNode: 0, nextNode: price });            
            prices.push(price);
        }
        else {
            DoublyLinkedNode memory node = orderedPricesList[0];
            bool terminate = false;
            while (node.nextNode != 0 && !terminate) {
                if (price == node.nextNode) {
                    // Do nothing, this price already exists and is sorted.
                    terminate = true;
                } 
                else if (price < node.nextNode) {
                    // If it's not the end of the list, move to the next node.
                    if (orderedPricesList[node.nextNode].nextNode != 0) {
                        node = orderedPricesList[node.nextNode];                        
                    } else {
                        // Add this price to the end of the list.
                        orderedPricesList[price] = DoublyLinkedNode({value: price, previousNode: node.nextNode, nextNode: 0 });
                        orderedPricesList[node.nextNode].nextNode = price;
        
                        prices.push(price);
                        terminate = true;
                    }
                } else {                    
                    // Add the new node between 2 nodes.
                    orderedPricesList[price] = DoublyLinkedNode({value: price, previousNode: node.value, nextNode: node.nextNode });
                    orderedPricesList[node.value].nextNode = price;
                    orderedPricesList[node.nextNode].previousNode = price;
    
                    prices.push(price);
                    terminate = true;
                }            
            }
        }
    }

    /**
     * @notice  Gets the bids at this price.
     * @param   price  The price.
     * @return  TokenBid  The bids.
     */
    function getBidsAtPrice(uint256 price) public view returns (TokenBid[] memory) {
        require(price > 0, "Price cannot be 0.");

        return (bids[price]);
    }

    /**
     * @notice  Returns the list of prices.
     * @return  uint256[]  The prices.
     */
    function getBidsPrices() public view returns (uint256[] memory) {
        return prices;
    }

    function getNodeValue(uint256 nodeValue) public view returns (DoublyLinkedNode memory) {
        return orderedPricesList[nodeValue];
    }

    /**
     * @notice  Terminates the auction.
     * @dev     Anyone can call this method so there is no dependance on the owner to execute it.
     *          When the auction terminates, the item is assigned ot the winner and the contract owner is paid.
     */
    function endTokensAuction() external {
        
        // Check the auction is past the deadline.
        require(block.timestamp > auctionEndTime, "Auction deadline has not yet been reached.");

        // Check the auction has not already ended.        
        require(auctionInProgress, "Auction has already ended.");
        
        // Calculate the total to transfer to the owner of the contract.
        DoublyLinkedNode memory node = orderedPricesList[0];     

        while (node.nextNode != 0) {
            
            // Go through the list of bids at that price.
            // They're already in descending order of price and order of insertion.
            TokenBid[] memory bidsToSettle = bids[node.nextNode];
            for (uint256 i = 0; i < bidsToSettle.length; i++) {

                if (auctionedTokens > 0) {
                    // Check how many tokens are available to transfer.
                    uint256 tokensToTransfer = auctionedTokens < bidsToSettle[i].amount ? auctionedTokens : bidsToSettle[i].amount;
                    
                    // Transfer the tokens to the bidder.
                    token.transfer(bidsToSettle[i].bidder, tokensToTransfer);
                    
                    // Pay the contract owner.
                    payable(owner).transfer(tokensToTransfer * bidsToSettle[i].price);

                    auctionedTokens -= tokensToTransfer;                    

                    // IF this big was partially filled, add the unsold tokens to the refund pool.
                    if (tokensToTransfer < bidsToSettle[i].amount) {
                        refunds[bidsToSettle[i].bidder] = (bidsToSettle[i].amount - tokensToTransfer) * bidsToSettle[i].price;    
                    }
                } else {
                    // Add the unfilled bids to the refund pool.
                    refunds[bidsToSettle[i].bidder] = bidsToSettle[i].amount * bidsToSettle[i].price;
                }
            }

            node = orderedPricesList[node.nextNode];        
        }

        // Mark the auction as finished.
        auctionInProgress = false;       
    }

    /**
     * @notice  Refunds their funds to unsuccessful bidders.
     * @dev     Bidders needs to call this method for themselves.
     *          When called this method will return all their funds, not funds specific to a particular bid.
     */
    function withdrawUnsuccessfulBids() public {

        // The refunds for a user are aggregating regardless of which item was outbid.
        uint256 amount = refunds[msg.sender];

        require(amount > 0, "Nothing to withdraw.");

        // Reset the refund amount for this user to 0 and refund their balance.
        refunds[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }
}
