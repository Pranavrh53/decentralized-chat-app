// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;


contract ChatMetadata {
    struct MessageMeta {
        address sender;
        address receiver;
        uint256 timestamp;
        bytes32 messageHash;
        string ipfsHash;  // IPFS content identifier (CID)
    }

    struct Friend {
        address friendAddress;
        string name;
        uint256 addedAt;
        bool exists;
    }

    mapping(uint256 => MessageMeta) public messages;
    uint256 public messageCount;
    
    // Mapping to track messages between two users: user1 => user2 => message IDs
    mapping(address => mapping(address => uint256[])) public userMessages;

    // Mapping from user address => friend address => Friend struct
    mapping(address => mapping(address => Friend)) public friends;
    // Mapping from user address => array of friend addresses
    mapping(address => address[]) public userFriends;

    event MetadataStored(uint256 id, address sender, address receiver, uint256 timestamp, string ipfsHash);
    event FriendAdded(address indexed user, address indexed friendAddress, string name, uint256 timestamp);
    event FriendRemoved(address indexed user, address indexed friendAddress, uint256 timestamp);

    function storeMetadata(address _receiver, bytes32 _messageHash, string memory _ipfsHash) public {
        messageCount++;
        messages[messageCount] = MessageMeta(msg.sender, _receiver, block.timestamp, _messageHash, _ipfsHash);
        
        // Track message for both sender and receiver
        userMessages[msg.sender][_receiver].push(messageCount);
        userMessages[_receiver][msg.sender].push(messageCount);
        
        emit MetadataStored(messageCount, msg.sender, _receiver, block.timestamp, _ipfsHash);
    }

    function getMetadata(uint256 _id) public view returns (MessageMeta memory) {
        return messages[_id];
    }
    
    // Get all message IDs between two users
    function getMessagesBetweenUsers(address _user1, address _user2) public view returns (uint256[] memory) {
        return userMessages[_user1][_user2];
    }
    
    // Get message count between two users
    function getMessageCount(address _user1, address _user2) public view returns (uint256) {
        return userMessages[_user1][_user2].length;
    }

    // Add a friend
    function addFriend(address _friendAddress, string memory _name) public {
        require(_friendAddress != address(0), "Invalid friend address");
        require(_friendAddress != msg.sender, "Cannot add yourself as friend");
        require(!friends[msg.sender][_friendAddress].exists, "Friend already exists");
        require(bytes(_name).length > 0, "Name cannot be empty");

        friends[msg.sender][_friendAddress] = Friend({
            friendAddress: _friendAddress,
            name: _name,
            addedAt: block.timestamp,
            exists: true
        });

        userFriends[msg.sender].push(_friendAddress);

        emit FriendAdded(msg.sender, _friendAddress, _name, block.timestamp);
    }

    // Remove a friend
    function removeFriend(address _friendAddress) public {
        require(friends[msg.sender][_friendAddress].exists, "Friend does not exist");

        friends[msg.sender][_friendAddress].exists = false;

        // Remove from array
        address[] storage friendList = userFriends[msg.sender];
        for (uint i = 0; i < friendList.length; i++) {
            if (friendList[i] == _friendAddress) {
                friendList[i] = friendList[friendList.length - 1];
                friendList.pop();
                break;
            }
        }

        emit FriendRemoved(msg.sender, _friendAddress, block.timestamp);
    }

    // Get friend details
    function getFriend(address _user, address _friendAddress) public view returns (Friend memory) {
        return friends[_user][_friendAddress];
    }

    // Get all friends for a user
    function getFriends(address _user) public view returns (address[] memory) {
        return userFriends[_user];
    }

    // Get friend count
    function getFriendCount(address _user) public view returns (uint256) {
        return userFriends[_user].length;
    }
}
