// Friend management blockchain functions
import { getWeb3 } from './blockchain';

let contract;

export const setContract = (contractInstance) => {
  contract = contractInstance;
};

/**
 * Add a friend to the blockchain
 * @param {string} friendAddress - Wallet address of the friend
 * @param {string} name - Name of the friend
 * @returns {Promise<object>} - Transaction receipt
 */
export const addFriendOnChain = async (friendAddress, name) => {
  const web3 = getWeb3();
  
  if (!contract) {
    throw new Error("Contract not initialized. Call initWeb3() first.");
  }

  try {
    const accounts = await web3.eth.getAccounts();
    const account = accounts[0];

    console.log(`📝 Adding friend ${name} (${friendAddress}) on blockchain...`);

    const tx = await contract.methods
      .addFriend(friendAddress, name)
      .send({ from: account });

    console.log(`✅ Friend added on blockchain! Transaction hash: ${tx.transactionHash}`);
    return tx;
  } catch (error) {
    console.error("❌ Error adding friend on blockchain:", error);
    throw new Error(`Failed to add friend: ${error.message}`);
  }
};

/**
 * Remove a friend from the blockchain
 * @param {string} friendAddress - Wallet address of the friend to remove
 * @returns {Promise<object>} - Transaction receipt
 */
export const removeFriendOnChain = async (friendAddress) => {
  const web3 = getWeb3();
  
  if (!contract) {
    throw new Error("Contract not initialized. Call initWeb3() first.");
  }

  try {
    const accounts = await web3.eth.getAccounts();
    const account = accounts[0];

    console.log(`🗑️ Removing friend (${friendAddress}) from blockchain...`);

    const tx = await contract.methods
      .removeFriend(friendAddress)
      .send({ from: account });

    console.log(`✅ Friend removed from blockchain! Transaction hash: ${tx.transactionHash}`);
    return tx;
  } catch (error) {
    console.error("❌ Error removing friend from blockchain:", error);
    throw new Error(`Failed to remove friend: ${error.message}`);
  }
};

/**
 * Get all friends from the blockchain
 * @param {string} userAddress - Wallet address of the user
 * @returns {Promise<Array>} - Array of friend objects
 */
export const getFriendsFromChain = async (userAddress) => {
  if (!contract) {
    throw new Error("Contract not initialized. Call initWeb3() first.");
  }

  try {
    console.log(`📖 Fetching friends from blockchain for ${userAddress}...`);

    // Get list of friend addresses
    const friendAddresses = await contract.methods.getFriends(userAddress).call();

    // Get detailed information for each friend
    const friendsPromises = friendAddresses.map(async (friendAddress) => {
      const friendData = await contract.methods.getFriend(userAddress, friendAddress).call();
      return {
        address: friendData.friendAddress,
        name: friendData.name,
        addedAt: new Date(Number(friendData.addedAt) * 1000).toISOString(),
        exists: friendData.exists
      };
    });

    const friends = await Promise.all(friendsPromises);
    
    // Filter out any friends that have been marked as not existing
    const activeFriends = friends.filter(f => f.exists);

    console.log(`✅ Loaded ${activeFriends.length} friends from blockchain`);
    return activeFriends;
  } catch (error) {
    console.error("❌ Error fetching friends from blockchain:", error);
    // Return empty array if error (e.g., no friends yet)
    return [];
  }
};

/**
 * Get friend count from the blockchain
 * @param {string} userAddress - Wallet address of the user
 * @returns {Promise<number>} - Number of friends
 */
export const getFriendCount = async (userAddress) => {
  if (!contract) {
    throw new Error("Contract not initialized. Call initWeb3() first.");
  }

  try {
    const count = await contract.methods.getFriendCount(userAddress).call();
    return Number(count);
  } catch (error) {
    console.error("❌ Error fetching friend count:", error);
    return 0;
  }
};
