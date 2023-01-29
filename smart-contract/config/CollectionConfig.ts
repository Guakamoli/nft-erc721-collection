import CollectionConfigInterface from '../lib/CollectionConfigInterface';
import * as Networks from '../lib/Networks';
import * as Marketplaces from '../lib/Marketplaces';
import whitelistAddresses from './whitelist.json';

const CollectionConfig: CollectionConfigInterface = {
  testnet: Networks.bscTestnet,
  mainnet: Networks.bscMainnet,
  // The contract name can be updated using the following command:
  // yarn rename-contract NEW_CONTRACT_NAME
  // Please DO NOT change it manually!
  contractName: "OGNftTokenV2",
  tokenName: "REVO OG Pass V2",
  tokenSymbol: "REVOOGV2",
  hiddenMetadataUri: "ipfs://__CID__/hidden.json",
  maxSupply: 10000,
  whitelistSale: {
    price: 0.05,
    maxMintAmountPerTx: 1,
  },
  preSale: {
    price: 0.07,
    maxMintAmountPerTx: 1,
  },
  publicSale: {
    price: 0.09,
    maxMintAmountPerTx: 1,
  },
  contractAddress: "0xAE53147f42636e3D6D1afFB4fbb24db0799087ec",
  marketplaceIdentifier: "revo-og-pass-v2",
  marketplaceConfig: Marketplaces.openSea,
  whitelistAddresses,
  royaltyBasisPoint: 250,
};

export default CollectionConfig;
