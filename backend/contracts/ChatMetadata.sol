// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;


contract ChatMetadata {
    struct MessageMeta {
        address sender;
        address receiver;
        uint256 timestamp;
        bytes32 messageHash;
    }

    mapping(uint256 => MessageMeta) public messages;
    uint256 public messageCount;

    event MetadataStored(uint256 id, address sender, address receiver, uint256 timestamp);

    function storeMetadata(address _receiver, bytes32 _messageHash) public {
        messageCount++;
        messages[messageCount] = MessageMeta(msg.sender, _receiver, block.timestamp, _messageHash);
        emit MetadataStored(messageCount, msg.sender, _receiver, block.timestamp);
    }

    function getMetadata(uint256 _id) public view returns (MessageMeta memory) {
        return messages[_id];
    }
}
