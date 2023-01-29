import keccak256 from "keccak256";
import { MerkleTree } from "merkletreejs";
// eslint-disable-next-line node/no-missing-import
import NftContractProvider from "../lib/NftContractProvider";
import CollectionConfig from "../config/CollectionConfig";

async function main() {
  // "ipfs://bafybeifvyt3w43vy2m2ellduae5jzfs5mauq7klvu452rz2mf2zptvw72i/";

  // Check configuration
  if (CollectionConfig.whitelistAddresses.length < 1) {
    throw new Error(
      "\x1b[31merror\x1b[0m " +
        "The whitelist is empty, please add some addresses to the configuration."
    );
  }

  // Build the Merkle Tree
  const leafNodes = CollectionConfig.whitelistAddresses.map((addr) =>
    keccak256(addr)
  );
  const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
  const rootHash = "0x" + merkleTree.getRoot().toString("hex");

  const contract = await NftContractProvider.getContract();

  // Update root hash (if changed)
  if ((await contract.merkleRoot()) !== rootHash) {
    console.log(`Updating the root hash to: ${rootHash}`);

    await (await contract.setMerkleRoot(rootHash)).wait();
  }

  console.log("Ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
