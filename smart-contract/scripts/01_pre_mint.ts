import NftContractProvider from "../lib/NftContractProvider";
import CollectionConfig from "../config/CollectionConfig";

async function main() {
  const contract = await NftContractProvider.getContract();

  if (!process.env.PRE_MINT_ADDRESS) {
    throw new Error("pre mint address not found. use `PRE_MINT_ADDRESS=0x?`");
  }

  const mintAddress = String(process.env.PRE_MINT_ADDRESS);
  const preMintMaxAmount = 2777;
  await contract.setMaxMintAmountPerTx(preMintMaxAmount);
  await contract.mintForAddress(preMintMaxAmount, mintAddress);
  await contract.setMaxMintAmountPerTx(
    CollectionConfig.whitelistSale.maxMintAmountPerTx
  );
  console.log("pre mint success!");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
