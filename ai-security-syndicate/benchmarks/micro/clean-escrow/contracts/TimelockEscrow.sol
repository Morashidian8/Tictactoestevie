// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TimelockEscrow
/// @notice Lock ETH for a beneficiary until `unlockAt`.
contract TimelockEscrow {
    struct Lock {
        address beneficiary;
        uint128 amount;
        uint64 unlockAt;
        bool claimed;
    }

    mapping(uint256 => Lock) public locks;
    uint256 public nextId;

    event Locked(uint256 indexed id, address indexed beneficiary, uint256 amount, uint64 unlockAt);
    event Claimed(uint256 indexed id, address indexed beneficiary, uint256 amount);

    function lock(address beneficiary, uint64 unlockAt) external payable returns (uint256 id) {
        require(msg.value > 0 && msg.value <= type(uint128).max, "bad amount");
        require(beneficiary != address(0), "bad beneficiary");
        require(unlockAt > block.timestamp, "bad unlock");
        id = nextId++;
        locks[id] = Lock(beneficiary, uint128(msg.value), unlockAt, false);
        emit Locked(id, beneficiary, msg.value, unlockAt);
    }

    function claim(uint256 id) external {
        Lock storage l = locks[id];
        require(msg.sender == l.beneficiary, "not beneficiary");
        require(block.timestamp >= l.unlockAt, "locked");
        require(!l.claimed, "claimed");
        l.claimed = true;
        uint256 amount = l.amount;
        emit Claimed(id, msg.sender, amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
    }
}
