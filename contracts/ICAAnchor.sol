// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @title ICA audit anchor
/// @notice Timestamps the Merkle root of each daily batch of sealed ICA cleaning records.
/// Only hashes are emitted. No personal, site or customer data ever goes on-chain.
contract ICAAnchor {
    address public immutable owner;

    event Anchored(uint256 indexed batchId, bytes32 root, uint256 recordCount);

    constructor() {
        owner = msg.sender;
    }

    function anchor(uint256 batchId, bytes32 root, uint256 recordCount) external {
        require(msg.sender == owner, "not owner");
        emit Anchored(batchId, root, recordCount);
    }
}
