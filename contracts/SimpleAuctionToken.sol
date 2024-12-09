// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleAuctionToken is ERC20 {

    // Define the supply of MyToken to 1,000.
    uint256 constant initialSupply = 1000 * (10**18);

    constructor() ERC20("MyToken", "MTK") {
        _mint(msg.sender, initialSupply);
    }
}