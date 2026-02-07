require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1", // Ganache default
      port: 8545,        // Ganache default
      network_id: "*"    // Match any network
    },
    sepolia: {
      provider: () => new HDWalletProvider({
        privateKeys: [process.env.PRIVATE_KEY],
        providerOrUrl: process.env.RPC_URL,
        chainId: 11155111
      }),
      network_id: 11155111,
      gas: 5000000,
      gasPrice: 20000000000,  // 20 Gwei
      confirmations: 2,       // # of confirmations to wait between deployments
      timeoutBlocks: 200,     // # of blocks before a deployment times out
      skipDryRun: true        // Skip dry run before migrations
    }
  },
  compilers: {
    solc: {
      version: "0.8.19",  // Pin Solidity version
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  contracts_directory: './contracts/',  // Where your ChatMetadata.sol is
  migrations_directory: './migrations/'
};
