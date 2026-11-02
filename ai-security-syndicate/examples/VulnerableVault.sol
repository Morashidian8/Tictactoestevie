// SPDX-License-Identifier: MIT
// Deliberately vulnerable training target. DO NOT DEPLOY.
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @notice ERC4626-style vault. Invariant: shares are always redeemable for
///         their pro-rata share of `asset.balanceOf(this)`.
contract VulnerableVault {
    IERC20 public immutable asset;
    address public owner;
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    constructor(IERC20 _asset) {
        asset = _asset;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    /// @dev first-depositor inflation: no virtual shares, rounding down
    function deposit(uint256 amount) external returns (uint256 minted) {
        uint256 bal = asset.balanceOf(address(this));
        minted = totalShares == 0 ? amount : (amount * totalShares) / bal;
        asset.transferFrom(msg.sender, address(this), amount); // unchecked return value
        shares[msg.sender] += minted;
        totalShares += minted;
    }

    function withdraw(uint256 shareAmount) external {
        uint256 amount = (shareAmount * asset.balanceOf(address(this))) / totalShares;
        asset.transfer(msg.sender, amount);              // interaction before effects
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
    }

    function sweep(address to) external onlyOwner {
        asset.transfer(to, asset.balanceOf(address(this)));
    }
}
