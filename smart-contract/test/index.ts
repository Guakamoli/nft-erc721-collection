import chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { constants, BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import CollectionConfig from './../config/CollectionConfig';
import ContractArguments from '../config/ContractArguments';
import { NftContractType } from '../lib/NftContractProvider';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(ChaiAsPromised);

// Prevent supply test exceeds block gas limit
CollectionConfig.maxSupply = 300;

enum SaleType {
  WHITELIST = CollectionConfig.whitelistSale.price,
  PRE_SALE = CollectionConfig.preSale.price,
  PUBLIC_SALE = CollectionConfig.publicSale.price,
};

const whitelistAddresses = [
  // Hardhat test addresses...
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
  "0xBcd4042DE499D14e55001CcbB24a551F3b954096",
  "0x71bE63f3384f5fb98995898A86B02Fb2426c5788",
  "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a",
  "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec",
  "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
  "0xcd3B766CCDd6AE721141F452C550Ca635964ce71",
  "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",
  "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E",
  "0xdD2FD4581271e230360230F9337D5c0430Bf44C0",
  "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199"
];

function getPrice(saleType: SaleType, mintAmount: number) {
  return utils.parseEther(saleType.toString()).mul(mintAmount);
}

function getMessageHash(selector: string, cids: string[], feeBps: number, contractAddress: string, senderAddress: string) {
  let messageHash = utils.solidityKeccak256(['bytes4', 'string[]', 'uint96', 'address', 'address'], [selector, cids, feeBps, contractAddress, senderAddress]);
  let messageHashBinary = utils.arrayify(messageHash);
  return messageHashBinary;
}

describe(CollectionConfig.contractName, function () {
  let deploy!: SignerWithAddress;
  let whitelistedUser!: SignerWithAddress;
  let holder!: SignerWithAddress;
  let externalUser!: SignerWithAddress;
  let treasury!: SignerWithAddress;
  let drawer!: SignerWithAddress;
  let contract!: NftContractType;

  before(async function () {
    [deploy, whitelistedUser, holder, externalUser, treasury, drawer] = await ethers.getSigners();
  });

  it('Contract deployment', async function () {
    const Contract = await ethers.getContractFactory(CollectionConfig.contractName);
    contract = await Contract.deploy(...ContractArguments.slice(0, 3), CollectionConfig.maxSupply, ...ContractArguments.slice(4)) as NftContractType;

    await contract.deployed();
  });

  it('Check initial data', async function () {
    expect(await contract.name()).to.equal(CollectionConfig.tokenName);
    expect(await contract.symbol()).to.equal(CollectionConfig.tokenSymbol);
    expect(await contract.cost()).to.equal(getPrice(SaleType.WHITELIST, 1));
    expect(await contract.maxSupply()).to.equal(CollectionConfig.maxSupply);
    expect(await contract.maxMintAmountPerTx()).to.equal(CollectionConfig.whitelistSale.maxMintAmountPerTx);
    expect(await contract.hiddenMetadataUri()).to.equal(CollectionConfig.hiddenMetadataUri);

    expect(await contract.paused()).to.equal(true);
    expect(await contract.whitelistMintEnabled()).to.equal(false);
    expect(await contract.revealed()).to.equal(false);

    await expect(contract.tokenURI(1)).to.be.revertedWith('ERC721Metadata: URI query for nonexistent token');
  });

  it('Before any sale', async function () {
    // Nobody should be able to mint from a paused contract
    await expect(contract.connect(whitelistedUser).mint(['1'], 0, '0x00', {value: getPrice(SaleType.WHITELIST, 1)})).to.be.revertedWith('Pausable: paused');
    await expect(contract.connect(whitelistedUser).whitelistMint(['2'], 0, '0x00', [], {value: getPrice(SaleType.WHITELIST, 1)})).to.be.revertedWith('The whitelist sale is not enabled!');
    await expect(contract.connect(holder).mint(['3'], 0, '0x00', {value: getPrice(SaleType.WHITELIST, 1)})).to.be.revertedWith('Pausable: paused');
    await expect(contract.connect(holder).whitelistMint(['4'], 0, '0x00', [], {value: getPrice(SaleType.WHITELIST, 1)})).to.be.revertedWith('The whitelist sale is not enabled!');
    await expect(contract.connect(deploy).mint(['5'], 0, '0x00', {value: getPrice(SaleType.WHITELIST, 1)})).to.be.revertedWith('Pausable: paused');
    await expect(contract.connect(deploy).whitelistMint(['6'], 0, '0x00', [], {value: getPrice(SaleType.WHITELIST, 1)})).to.be.revertedWith('The whitelist sale is not enabled!');

    // The owner should always be able to run mintForAddress
    await (await contract.mintForAddress(['7'], 100, await deploy.getAddress())).wait();
    await (await contract.mintForAddress(['8'], 0, await whitelistedUser.getAddress())).wait();
    // But not over the maxMintAmountPerTx
    await expect(contract.mintForAddress(
      new Array((await contract.maxMintAmountPerTx()).add(1).toNumber()).fill('9'),
      0,
      await holder.getAddress(),
    )).to.be.revertedWith('Invalid mint amount!');
    // And cid can't be empty
    await expect(contract.mintForAddress([''], 0, await deploy.getAddress())).to.be.revertedWith('CID can not be empty!');
    // And can't mint same cid twice
    await expect(contract.mintForAddress(['7'], 0, await deploy.getAddress())).to.be.revertedWith('CID already exists!');

    // Check balances
    expect(await contract.balanceOf(await deploy.getAddress())).to.equal(1);
    expect(await contract.balanceOf(await whitelistedUser.getAddress())).to.equal(1);
    expect(await contract.balanceOf(await holder.getAddress())).to.equal(0);
    expect(await contract.balanceOf(await externalUser.getAddress())).to.equal(0);
  });

  it('Whitelist sale', async function () {
    // Build MerkleTree
    const leafNodes = whitelistAddresses.map(addr => keccak256(addr));
    const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
    const rootHash = merkleTree.getRoot();
    // Update the root hash
    await (await contract.setMerkleRoot('0x' + rootHash.toString('hex'))).wait();

    await contract.setWhitelistMintEnabled(true);

    const selector = contract.interface.getSighash('whitelistMint(string[],uint96,bytes,bytes32[])');
    // Whitelist mint
    await contract.connect(whitelistedUser).whitelistMint(
      ['11'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['11'], 0, contract.address, await whitelistedUser.getAddress())),
      merkleTree.getHexProof(keccak256(await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.WHITELIST, 1)},
    );
    // Trying to mint same cid twice
    await expect(contract.connect(whitelistedUser).whitelistMint(
      ['11'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['11'], 0, contract.address, await whitelistedUser.getAddress())),
      merkleTree.getHexProof(keccak256(await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.WHITELIST, 1)},
    )).to.be.revertedWith('CID already exists!');
    // Sending an invalid mint amount
    await expect(contract.connect(whitelistedUser).whitelistMint(
      new Array((await contract.maxMintAmountPerTx()).add(1).toNumber()).fill('12'),
      0,
      await deploy.signMessage(getMessageHash(selector, new Array((await contract.maxMintAmountPerTx()).add(1).toNumber()).fill('12'), 0, contract.address, await whitelistedUser.getAddress())),
      merkleTree.getHexProof(keccak256(await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.WHITELIST, await (await contract.maxMintAmountPerTx()).add(1).toNumber())},
    )).to.be.revertedWith('Invalid mint amount!');
    await expect(contract.connect(whitelistedUser).whitelistMint(
      [],
      0,
      await deploy.signMessage(getMessageHash(selector, [], 0, contract.address, await whitelistedUser.getAddress())),
      merkleTree.getHexProof(keccak256(await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.WHITELIST, 0)},
    )).to.be.revertedWith('Invalid mint amount!');
    // Sending insufficient funds
    await expect(contract.connect(whitelistedUser).whitelistMint(
      ['13'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['13'], 0, contract.address, await whitelistedUser.getAddress())),
      merkleTree.getHexProof(keccak256(await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.WHITELIST, 1).sub(1)},
    )).to.be.rejectedWith(Error, 'insufficient funds for intrinsic transaction cost');
    // Sending invalid signature
    await expect(contract.connect(whitelistedUser).whitelistMint(
      ['14'],
      0,
      (await deploy.signMessage(getMessageHash(selector, ['14'], 0, contract.address, await whitelistedUser.getAddress()))).slice(0, -8) + '12345678',
      merkleTree.getHexProof(keccak256(await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.WHITELIST, 1)},
    )).to.be.revertedWith('ECDSA: invalid signature');
    // Pretending to be someone else
    await expect(contract.connect(holder).whitelistMint(
      ['15'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['15'], 0, contract.address, await holder.getAddress())),
      merkleTree.getHexProof(keccak256(await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.WHITELIST, 1)},
    )).to.be.revertedWith('Invalid proof!');
    // Sending an invalid proof
    await expect(contract.connect(holder).whitelistMint(
      ['16'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['16'], 0, contract.address, await holder.getAddress())),
      merkleTree.getHexProof(keccak256(await holder.getAddress())),
      {value: getPrice(SaleType.WHITELIST, 1)},
    )).to.be.revertedWith('Invalid proof!');
    // Sending no proof at all
    await expect(contract.connect(holder).whitelistMint(
      ['17'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['17'], 0, contract.address, await holder.getAddress())),
      [],
      {value: getPrice(SaleType.WHITELIST, 1)},
    )).to.be.revertedWith('Invalid proof!');
    
    // Pause whitelist sale
    await contract.setWhitelistMintEnabled(false);
    await contract.setCost(utils.parseEther(CollectionConfig.preSale.price.toString()));

    // Check balances
    expect(await contract.balanceOf(await deploy.getAddress())).to.equal(1);
    expect(await contract.balanceOf(await whitelistedUser.getAddress())).to.equal(2);
    expect(await contract.balanceOf(await holder.getAddress())).to.equal(0);
    expect(await contract.balanceOf(await externalUser.getAddress())).to.equal(0);
  });
    
  it('Pre-sale (same as public sale)', async function () {
    await contract.setMaxMintAmountPerTx(CollectionConfig.preSale.maxMintAmountPerTx);
    await contract.setPaused(false);
    
    const selector = contract.interface.getSighash('mint(string[],uint96,bytes)');
    // Pre-sale mint
    await contract.connect(holder).mint(
      ['21', '22'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['21', '22'], 0, contract.address, await holder.getAddress())),
      {value: getPrice(SaleType.PRE_SALE, 2)},
    );
    await contract.connect(whitelistedUser).mint(
      ['23'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['23'], 0, contract.address, await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.PRE_SALE, 1)},
    );
    // Sending insufficient funds
    await expect(contract.connect(holder).mint(
      ['24'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['24'], 0, contract.address, await holder.getAddress())),
      {value: getPrice(SaleType.PRE_SALE, 1).sub(1)},
    )).to.be.rejectedWith(Error, 'insufficient funds for intrinsic transaction cost');
    // Sending an invalid mint amount
    await expect(contract.connect(whitelistedUser).mint(
      new Array((await contract.maxMintAmountPerTx()).add(1).toNumber()).fill('25'),
      0,
      await deploy.signMessage(getMessageHash(selector, new Array((await contract.maxMintAmountPerTx()).add(1).toNumber()).fill('25'), 0, contract.address, await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.PRE_SALE, await (await contract.maxMintAmountPerTx()).add(1).toNumber())},
    )).to.be.revertedWith('Invalid mint amount!');
    await expect(contract.connect(whitelistedUser).mint(
      [],
      0,
      await deploy.signMessage(getMessageHash(selector, [], 0, contract.address, await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.PRE_SALE, 0)},
    )).to.be.revertedWith('Invalid mint amount!');
    // Sending a whitelist mint transaction
    await expect(contract.connect(whitelistedUser).whitelistMint(
      ['26'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['26'], 0, contract.address, await whitelistedUser.getAddress())),
      [],
      {value: getPrice(SaleType.WHITELIST, 1)},
    )).to.be.rejectedWith(Error, 'Insufficient funds!');
    
    // Pause pre-sale
    await contract.setPaused(true);
    await contract.setCost(utils.parseEther(CollectionConfig.publicSale.price.toString()));
  });
    
  it('Roles only functions', async function () {
    await expect(contract.connect(externalUser).mintForAddress(['31'], 0, await externalUser.getAddress())).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setRevealed(false)).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setCost(utils.parseEther('0.0000001'))).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setMaxMintAmountPerTx(99999)).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setHiddenMetadataUri('INVALID_URI')).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setUriPrefix('INVALID_PREFIX')).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setUriSuffix('INVALID_SUFFIX')).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setPaused(false)).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setMerkleRoot('0x0000000000000000000000000000000000000000000000000000000000000000')).to.be.revertedWith('AccessControl: account ');
    await expect(contract.connect(externalUser).setWhitelistMintEnabled(false)).to.be.revertedWith('AccessControl: account ');
  });
    
  it('Wallet of owner', async function () {
    expect(await contract.tokensOfOwner(await deploy.getAddress())).deep.equal([
      BigNumber.from(1),
    ]);
    expect(await contract.tokensOfOwner(await whitelistedUser.getAddress())).deep.equal([
      BigNumber.from(2),
      BigNumber.from(3),
      BigNumber.from(6),
    ]);
    expect(await contract.tokensOfOwner(await holder.getAddress())).deep.equal([
      BigNumber.from(4),
      BigNumber.from(5),
    ]);
    expect(await contract.tokensOfOwner(await externalUser.getAddress())).deep.equal([]);
  });
    
  it('Supply checks (long)', async function () {
    if (process.env.EXTENDED_TESTS === undefined) {
      this.skip();
    }

    const alreadyMinted = 6;
    const maxMintAmountPerTx = 10;
    const iterations = Math.floor((CollectionConfig.maxSupply - alreadyMinted) / maxMintAmountPerTx);
    const expectedTotalSupply = iterations * maxMintAmountPerTx + alreadyMinted;
    const lastMintAmount = CollectionConfig.maxSupply - expectedTotalSupply;
    expect(await contract.totalSupply()).to.equal(alreadyMinted);

    await contract.setPaused(false);
    await contract.setMaxMintAmountPerTx(maxMintAmountPerTx);

    const selector = contract.interface.getSighash('mint(string[],uint96,bytes)');
    // Minting
    await Promise.all([...Array(iterations).keys()].map(async (it) => {
      let cids = [...Array(maxMintAmountPerTx).keys()].map(i => `${it + 4}${i}`);
      await contract.connect(whitelistedUser).mint(
        cids,
        0,
        await deploy.signMessage(getMessageHash(selector, cids, 0, contract.address, await whitelistedUser.getAddress())),
        {value: getPrice(SaleType.PUBLIC_SALE, maxMintAmountPerTx)},
      );
    }));

    // Try to mint over max supply (before sold-out)
    await expect(contract.connect(holder).mint(
      [...Array(lastMintAmount + 1).keys()].map(i => `${iterations + 4}${i}`),
      0,
      await deploy.signMessage(getMessageHash(selector, [...Array(lastMintAmount + 1).keys()].map(i => `${iterations + 4}${i}`), 0, contract.address, await holder.getAddress())),
      {value: getPrice(SaleType.PUBLIC_SALE, lastMintAmount + 1)},
    )).to.be.revertedWith('Max supply exceeded!');
    await expect(contract.connect(holder).mint(
      [...Array(lastMintAmount + 2).keys()].map(i => `${iterations + 4}${i}`),
      0,
      await deploy.signMessage(getMessageHash(selector, [...Array(lastMintAmount + 2).keys()].map(i => `${iterations + 4}${i}`), 0, contract.address, await holder.getAddress())),
      {value: getPrice(SaleType.PUBLIC_SALE, lastMintAmount + 2)},
    )).to.be.revertedWith('Max supply exceeded!');

    expect(await contract.totalSupply()).to.equal(expectedTotalSupply);

    // Mint last tokens with owner address and test walletOfOwner(...)
    await contract.connect(deploy).mint(
      [...Array(lastMintAmount).keys()].map(i => `${iterations + 4}${i}`),
      0,
      await deploy.signMessage(getMessageHash(selector, [...Array(lastMintAmount).keys()].map(i => `${iterations + 4}${i}`), 0, contract.address, await deploy.getAddress())),
      {value: getPrice(SaleType.PUBLIC_SALE, lastMintAmount)}
    );
    const expectedWalletOfOwner = [
      BigNumber.from(1),
    ];
    for (const i of [...Array(lastMintAmount).keys()].reverse()) {
      expectedWalletOfOwner.push(BigNumber.from(CollectionConfig.maxSupply - i));
    }
    expect(await contract.tokensOfOwner(
      await deploy.getAddress(),
      {
        // Set gas limit to the maximum value since this function should be used off-chain only and it would fail otherwise...
        gasLimit: BigNumber.from('0xffffffffffffffff'),
      },
    )).deep.equal(expectedWalletOfOwner);

    // Try to mint over max supply (after sold-out)
    await expect(contract.connect(whitelistedUser).mint(
      ['10000000000'],
      0,
      await deploy.signMessage(getMessageHash(selector, ['10000000000'], 0, contract.address, await whitelistedUser.getAddress())),
      {value: getPrice(SaleType.PUBLIC_SALE, 1)}
    )).to.be.revertedWith('Max supply exceeded!');

    expect(await contract.totalSupply()).to.equal(CollectionConfig.maxSupply);
  });
    
  it('Token URI generation', async function () {
    const uriPrefix = 'ipfs://__COLLECTION_CID__/';
    const uriSuffix = '.json';
    const totalSupply = await contract.totalSupply();

    expect(await contract.tokenURI(1)).to.equal(CollectionConfig.hiddenMetadataUri);

    // Reveal collection
    await contract.setUriPrefix(uriPrefix);
    await contract.setRevealed(true);

    // ERC721A uses token IDs starting from 0 internally...
    await expect(contract.tokenURI(0)).to.be.revertedWith('ERC721Metadata: URI query for nonexistent token');

    // Testing first and last minted tokens
    expect(await contract.tokenURI(1)).to.equal(`${uriPrefix}7${uriSuffix}`);
    expect(await contract.tokenURI(totalSupply)).to.equal(`${uriPrefix}${process.env.EXTENDED_TESTS === undefined ? '23' : totalSupply.add(33)}${uriSuffix}`);
  });

  it('ERC2981 NFT royalty support', async function () {
    expect(await contract.royaltyInfo(BigNumber.from(1), utils.parseEther('10000'))).deep.equal([
      await deploy.getAddress(),
      utils.parseEther('100'),
    ]);

    expect(await contract.royaltyInfo(BigNumber.from(2), utils.parseEther('10000'))).deep.equal([
      constants.AddressZero,
      constants.Zero,
    ]);

    await contract.connect(deploy).setRoyalty(BigNumber.from(1), await treasury.getAddress(), 250);
    expect(await contract.royaltyInfo(BigNumber.from(1), utils.parseEther('10000'))).deep.equal([
      await treasury.getAddress(),
      utils.parseEther('250'),
    ]);

    await contract.connect(treasury).renounceRoyalty(BigNumber.from(1));
    expect(await contract.royaltyInfo(BigNumber.from(1), utils.parseEther('10000'))).deep.equal([
      constants.AddressZero,
      constants.Zero,
    ]);

    await expect(contract.connect(deploy).setRoyalty(BigNumber.from(1), await treasury.getAddress(), 20000)
    ).to.be.revertedWith('ERC2981: royalty fee will exceed salePrice');

    await expect(contract.connect(treasury).setRoyalty(BigNumber.from(1), await treasury.getAddress(), 250)
    ).to.be.revertedWith('ApprovalCallerNotOwnerNorApproved()');

    await contract.connect(deploy).setRoyalty(BigNumber.from(1), await treasury.getAddress(), 250);
    await expect(contract.connect(deploy).setRoyalty(BigNumber.from(1), await treasury.getAddress(), 250)
    ).to.be.revertedWith('ERC2981: token owner is not royalty receiver');
    await expect(contract.connect(deploy).renounceRoyalty(BigNumber.from(1))
    ).to.be.revertedWith('ERC2981: caller is not royalty receiver');
  });

  it('Withdraw', async function () {
    expect(await contract.treasury()).to.be.equal(constants.AddressZero);

    await contract.grantRole(await contract.DRAWER_ROLE(), await drawer.getAddress());
    await contract.setTreasury(await treasury.getAddress());

    expect(await contract.hasRole(await contract.DRAWER_ROLE(), await drawer.getAddress())).to.be.true;
    expect(await contract.treasury()).to.be.equal(await treasury.getAddress());

    let provider = contract.provider;
    let contractBalance = await provider.getBalance(contract.address);
    let treasuryBalance = await provider.getBalance(await treasury.getAddress());

    await contract.connect(drawer).withdraw(contractBalance);
    await expect(contract.withdraw(contractBalance)).to.be.revertedWith('Withdraw amount will exceed balance');

    expect(await provider.getBalance(contract.address)).to.equal(0);
    expect(await provider.getBalance(await treasury.getAddress())).to.equal(treasuryBalance.add(contractBalance));
  });


  it('Reset CID and burn', async function () {
    const uriPrefix = 'ipfs://__COLLECTION_CID__/';
    const uriSuffix = '.json';
    const totalSupply = await contract.totalSupply();

    // Reveal collection
    await contract.setUriPrefix(uriPrefix);
    await contract.setUriSuffix(uriSuffix);
    await contract.setRevealed(true);

    // Reset CID
    expect(await contract.tokenURI(2)).to.equal(`${uriPrefix}8${uriSuffix}`);
    expect(await contract.tokenURI(totalSupply)).to.equal(`${uriPrefix}${process.env.EXTENDED_TESTS === undefined ? '23' : totalSupply.add(33)}${uriSuffix}`);

    // Burn first token
    await contract.connect(deploy).burn(1);
    expect(await contract.totalSupply()).to.equal(totalSupply.sub(1));
    await expect(contract.tokenURI(1)).to.be.revertedWith('ERC721Metadata: URI query for nonexistent token');
    await expect(contract.connect(deploy).burn(2)).to.be.revertedWith('TransferCallerNotOwnerNorApproved()');
  });
});
