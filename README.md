# A simple auction system - exercise 1

## Some design choices:
- The items are assigned an id based on the order they were added. 
  So the first item has id 0, the second has id 1 etc. It's basic but provides an easy way to check if an item exists by comparing the item id to the items count.
- When a new highest bid is placed, we don't automatically refund the former highest bidder. Instead, we expose a method to withdraw all the funds used in unsuccessful bids.
- Anyone can end an auction. This is to avoid scenarios where the owner gets cold feet and decide to hold on to the item.
- At the end of the auction, the owner is paid directly and the winning bid does not stay in the contract.
- Auctioned items have an independent duration time for maximum flexibility.

## Possible improvements
- Add events
- 

# A simple auction system - exercise 2

## Some design choices:
- In this auction, users can bid on tokens by specifying the number of tokens they want to buy as well as a price they're willing to pay for them.  
  When the auction ends, the bids should be executed in descending order price. The lowest bids will be executed last, or not at all if all the tokens allocated for the auctions have already been sold to highest bidders.  
  Because of these requirements, there is a need to know the order by which the bids should be executed.  
  1. A simple solution would be to sort them at the end of the auction. 
    This is not a good idea for the simple fact that sorting is expensive and if there are many bids, the user ending the auction will have to pay a heavy gas price.
  2. Another solution would be to sort the bids as part of the bid method.
    This is also not ideal because sorting is expensive and the latest bidders are heavily penalized as the set of bids to sort gets bigger.
  3. A much better idea is to use a **doubly linked list**. 
    A doubly linked list is a list of objects containing a value, a link to the previous item in the list and a link to the next item in the list.
    As an example, a list with with 2 items would look like the following: `[head] <-> [item1] <-> [item2] <-> [tail]`.
    In our case, we use a doubly linked list to keep track of bids prices in descending order.  
    So if we have 4 bids with prices (in order of when the bids were placed): 3, 2, 4, 2, the doubly linked list would look like this: `[head] <-> [4] <-> [3] <-> [2] <-> [tail]`. Notice that the bid with price 2 only appear once as this is a list of prices, not a list of bids.
    Every time a bid is placed, we simply walk down the list to find the right spot for insertion. So if a bid with a price of 2.5 comes in, the list will look like so: `[head] <-> [4] <-> [3] <-> [2.5] <-> [2] <-> [tail]`.
    This is very advantageous because the complexity of inserting the prices is at `O(n)` when n represents the prices and the prices are always fewer or equal to the bids. Any other sorting algorithm would give a complexity of `O(n logn)` or `O(n^2)` on the bids themselves.
    We also maintain a mapping of price to bids, so at the time the auction ends, we simply go through the doubly linked list and for each price, we settle the bids.  
    Later bidders will still pay more in fees to bid if the doubly linked list is large but this is easily justifiable, it's the cost of being late to the party.
- The auction contract is limited to a single auction. Once the auction is done, the contract becomes useless. This was done on purpose because allowing multiple auctions would add unnecessary complexity. 
- Anyone can end an auction. This is to avoid scenarios where the owner gets cold feet and decide to hold on to the tokens.
- At the end of the auction, the owner is paid, the tokens are distributed and all the funds that didn't get used go into a pool that unsuccessful bidders can withdraw.
- I also added a few methods to get an accurate picture of the current bids placed and the current prices so that anyone bidding can make an informed decision when placing a bid.

## Possible improvements
- Add events
- Make it possible to conduct multiple auctions using the same contract.
- Make it upgradable or more configurable so that more rules can be applied to auctions.
- Allow bidding for different types of tokens. 

# Testing tools used:
- Hardhat: Ethereum development environment to run a local node  
- ethers.js: Ethereum implementation in javascript
- Chai: BDD / TDD assertion library for node
- Mocha: Test framework running on Node.js
