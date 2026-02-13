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

    struct Group {
        bytes32 groupId;
        string name;
        string description;
        address[] members;
        uint256 createdAt;
        bool exists;
    }

    struct GroupMessage {
        bytes32 groupId;
        address sender;
        uint256 timestamp;
        bytes32 messageHash;
        string ipfsHash;
    }

    mapping(uint256 => MessageMeta) public messages;
    uint256 public messageCount;
    
    // Group management
    mapping(bytes32 => Group) public groups;
    mapping(bytes32 => mapping(address => bool)) public groupMembers; // groupId => member => isMember
    mapping(bytes32 => mapping(address => uint256)) public adminVotes; // groupId => admin => votes
    bytes32[] public allGroupIds;
    mapping(address => bytes32[]) public userGroups; // Groups a user belongs to
    
    // Group messages
    mapping(bytes32 => uint256[]) public groupMessages; // groupId => message IDs
    mapping(uint256 => GroupMessage) public groupMessageData;
    uint256 public groupMessageCount;
    
    // Mapping to track messages between two users: user1 => user2 => message IDs
    mapping(address => mapping(address => uint256[])) public userMessages;

    // Mapping from user address => friend address => Friend struct
    mapping(address => mapping(address => Friend)) public friends;
    // Mapping from user address => array of friend addresses
    mapping(address => address[]) public userFriends;

    event MetadataStored(uint256 id, address sender, address receiver, uint256 timestamp, string ipfsHash);
    event FriendAdded(address indexed user, address indexed friendAddress, string name, uint256 timestamp);
    event FriendRemoved(address indexed user, address indexed friendAddress, uint256 timestamp);
    
    // Group events
    event GroupCreated(bytes32 indexed groupId, string name, address indexed creator, uint256 timestamp);
    event MemberAdded(bytes32 indexed groupId, address indexed member, address indexed addedBy, uint256 timestamp);
    event MemberRemoved(bytes32 indexed groupId, address indexed member, uint256 timestamp);
    event GroupMessageSent(bytes32 indexed groupId, uint256 messageId, address indexed sender, uint256 timestamp, string ipfsHash);
    event AdminVoteCast(bytes32 indexed groupId, address indexed admin, address indexed voter, uint256 totalVotes);

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

    // ============ GROUP FUNCTIONS ============

    // Create a new group
    function createGroup(string memory _name, string memory _description, address[] memory _members) public returns (bytes32) {
        require(bytes(_name).length > 0, "Group name cannot be empty");
        require(_members.length > 0, "Group must have at least one member");
        
        // Generate unique group ID
        bytes32 groupId = keccak256(abi.encodePacked(_name, msg.sender, block.timestamp));
        require(!groups[groupId].exists, "Group ID collision");
        
        Group storage newGroup = groups[groupId];
        newGroup.groupId = groupId;
        newGroup.name = _name;
        newGroup.description = _description;
        newGroup.createdAt = block.timestamp;
        newGroup.exists = true;
        
        // Add creator as first member
        newGroup.members.push(msg.sender);
        groupMembers[groupId][msg.sender] = true;
        userGroups[msg.sender].push(groupId);
        
        // Add other members
        for (uint i = 0; i < _members.length; i++) {
            if (_members[i] != msg.sender && _members[i] != address(0) && !groupMembers[groupId][_members[i]]) {
                newGroup.members.push(_members[i]);
                groupMembers[groupId][_members[i]] = true;
                userGroups[_members[i]].push(groupId);
                emit MemberAdded(groupId, _members[i], msg.sender, block.timestamp);
            }
        }
        
        allGroupIds.push(groupId);
        emit GroupCreated(groupId, _name, msg.sender, block.timestamp);
        
        return groupId;
    }

    // Add member to group (any member can add)
    function addGroupMember(bytes32 _groupId, address _member) public {
        require(groups[_groupId].exists, "Group does not exist");
        require(groupMembers[_groupId][msg.sender], "Only members can add new members");
        require(_member != address(0), "Invalid member address");
        require(!groupMembers[_groupId][_member], "Already a member");
        
        Group storage group = groups[_groupId];
        group.members.push(_member);
        groupMembers[_groupId][_member] = true;
        userGroups[_member].push(_groupId);
        
        emit MemberAdded(_groupId, _member, msg.sender, block.timestamp);
    }

    // Leave group
    function leaveGroup(bytes32 _groupId) public {
        require(groups[_groupId].exists, "Group does not exist");
        require(groupMembers[_groupId][msg.sender], "Not a member");
        
        Group storage group = groups[_groupId];
        groupMembers[_groupId][msg.sender] = false;
        
        // Remove from members array
        for (uint i = 0; i < group.members.length; i++) {
            if (group.members[i] == msg.sender) {
                group.members[i] = group.members[group.members.length - 1];
                group.members.pop();
                break;
            }
        }
        
        // Remove from user's groups
        bytes32[] storage userGroupList = userGroups[msg.sender];
        for (uint i = 0; i < userGroupList.length; i++) {
            if (userGroupList[i] == _groupId) {
                userGroupList[i] = userGroupList[userGroupList.length - 1];
                userGroupList.pop();
                break;
            }
        }
        
        emit MemberRemoved(_groupId, msg.sender, block.timestamp);
    }

    // Vote for admin
    function voteForAdmin(bytes32 _groupId, address _admin) public {
        require(groups[_groupId].exists, "Group does not exist");
        require(groupMembers[_groupId][msg.sender], "Only members can vote");
        require(groupMembers[_groupId][_admin], "Admin must be a member");
        
        adminVotes[_groupId][_admin]++;
        
        emit AdminVoteCast(_groupId, _admin, msg.sender, adminVotes[_groupId][_admin]);
    }

    // Send group message
    function sendGroupMessage(bytes32 _groupId, bytes32 _messageHash, string memory _ipfsHash) public {
        require(groups[_groupId].exists, "Group does not exist");
        require(groupMembers[_groupId][msg.sender], "Only members can send messages");
        
        groupMessageCount++;
        groupMessageData[groupMessageCount] = GroupMessage({
            groupId: _groupId,
            sender: msg.sender,
            timestamp: block.timestamp,
            messageHash: _messageHash,
            ipfsHash: _ipfsHash
        });
        
        groupMessages[_groupId].push(groupMessageCount);
        
        emit GroupMessageSent(_groupId, groupMessageCount, msg.sender, block.timestamp, _ipfsHash);
    }

    // Get group info
    function getGroup(bytes32 _groupId) public view returns (
        string memory name,
        string memory description,
        address[] memory members,
        uint256 createdAt
    ) {
        require(groups[_groupId].exists, "Group does not exist");
        Group storage group = groups[_groupId];
        return (group.name, group.description, group.members, group.createdAt);
    }

    // Get groups for a user
    function getUserGroups(address _user) public view returns (bytes32[] memory) {
        return userGroups[_user];
    }

    // Get group messages
    function getGroupMessages(bytes32 _groupId) public view returns (uint256[] memory) {
        require(groups[_groupId].exists, "Group does not exist");
        return groupMessages[_groupId];
    }

    // Get group message details
    function getGroupMessage(uint256 _messageId) public view returns (GroupMessage memory) {
        return groupMessageData[_messageId];
    }

    // Check if user is member
    function isGroupMember(bytes32 _groupId, address _user) public view returns (bool) {
        return groupMembers[_groupId][_user];
    }

    // Get admin votes for a member
    function getAdminVotes(bytes32 _groupId, address _member) public view returns (uint256) {
        return adminVotes[_groupId][_member];
    }

    // Get all groups
    function getAllGroups() public view returns (bytes32[] memory) {
        return allGroupIds;
    }
}
