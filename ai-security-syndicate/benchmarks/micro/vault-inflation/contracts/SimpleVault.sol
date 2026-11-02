// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title SimpleVault
/// @notice Deposit `asset`, receive shares proportional to the vault's holdings.
contract SimpleVault {
    IERC20 public immutable asset;
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    event Deposit(address indexed user, uint256 assets, uint256 shares);
    event Withdraw(address indexed user, uint256 assets, uint256 shares);

    constructor(IERC20 _asset) {
        asset = _asset;
    }

    function deposit(uint256 amount) external returns (uint256 minted) {
        uint256 bal = asset.balanceOf(address(this));
        minted = totalShares == 0 ? amount : (amount * totalShares) / bal;
        require(asset.transferFrom(msg.sender, address(this), amount), "transfer failed");
        shares[msg.sender] += minted;
        totalShares += minted;
        emit Deposit(msg.sender, amount, minted);
    }

    function withdraw(uint256 shareAmount) external returns (uint256 amount) {
        amount = (shareAmount * asset.balanceOf(address(this))) / totalShares;
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        require(asset.transfer(msg.sender, amount), "transfer failed");
        emit Withdraw(msg.sender, amount, shareAmount);
    }
}
