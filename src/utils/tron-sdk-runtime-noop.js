class TronJsonRpcProvider {}

class TronWallet {
  constructor(privateKey, rpcUrl) {
    this.privateKey = privateKey;
    this.rpcUrl = rpcUrl;
  }
}

module.exports = {
  TronJsonRpcProvider,
  TronWallet,
};
