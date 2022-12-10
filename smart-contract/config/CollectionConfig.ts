import CollectionConfigInterface from '../lib/CollectionConfigInterface';
import * as Networks from '../lib/Networks';
import * as Marketplaces from '../lib/Marketplaces';
import whitelistAddresses from './whitelist.json';

const CollectionConfig: CollectionConfigInterface = {
  testnet: Networks.ethereumTestnet,
  mainnet: Networks.ethereumMainnet,
  // The contract name can be updated using the following command:
  // yarn rename-contract NEW_CONTRACT_NAME
  // Please DO NOT change it manually!
  contractName: 'OGNftToken',
  tokenName: 'REVO OG Pass',
  tokenSymbol: 'REVOOG',
  hiddenMetadataUri: 'https://bafkreidckb3rcgbda4c7vhfsyeit6actiks3fxd7roqmdjllxxawq2zeku.ipfs.nftstorage.link',
  maxSupply: 10000,
  whitelistSale: {
    price: 0.05,
    maxMintAmountPerTx: 1,
  },
  preSale: {
    price: 0.07,
    maxMintAmountPerTx: 2,
  },
  publicSale: {
    price: 0.09,
    maxMintAmountPerTx: 5,
  },
  contractAddress: '0x0f95fCb43a8e861f2fB99591933E693Bcd4a527D',
  marketplaceIdentifier: 'revo-og-pass',
  marketplaceConfig: Marketplaces.openSea,
  whitelistAddresses,
  royaltyBasisPoint: 750,
};

export default CollectionConfig;
