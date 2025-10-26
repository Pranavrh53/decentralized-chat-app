module.exports = {
  networks: {
    development: {
      host: "127.0.0.1", // Ganache default
      port: 8545,        // Ganache default
      network_id: "*"    // Match any network
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
