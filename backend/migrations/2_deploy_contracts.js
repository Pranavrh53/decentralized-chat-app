const ChatMetadata = artifacts.require("ChatMetadata");

module.exports = function(deployer) {
  deployer.deploy(ChatMetadata);  // No constructor arguments
};
