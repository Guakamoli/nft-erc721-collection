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
  contractName: 'REVOGlasses',
  tokenName: 'REVO The Glasses',
  tokenSymbol: 'THE GLASSES',
  hiddenMetadataUri: 'ipfs://__CID__/hidden.json',
  maxSupply: 200,
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
  contractAddress: null,
  marketplaceIdentifier: 'revo-the-glasses',
  marketplaceConfig: Marketplaces.openSea,
  whitelistAddresses,
  treasuryAddress: '0xc7b562f701F9F19fc936513D6d4576A85eDF19aD',
  royaltyBasisPoint: 750,
};

export default CollectionConfig;
