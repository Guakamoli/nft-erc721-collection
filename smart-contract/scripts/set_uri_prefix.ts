import keccak256 from "keccak256";
import { MerkleTree } from "merkletreejs";
// eslint-disable-next-line node/no-missing-import
import NftContractProvider from "../lib/NftContractProvider";
import CollectionConfig from "../config/CollectionConfig";

async function main() {
  // const contract = await NftContractProvider.getContract();
  // const uriPrefix = await contract.uriPrefix();
  // console.log(uriPrefix);

  // return;

  // 奥多姆
  // ipfs://bafybeifvyt3w43vy2m2ellduae5jzfs5mauq7klvu452rz2mf2zptvw72i/

  // OG Pass
  // ipfs://bafybeibxvmqp4uzbqkveffwa42sqmymnmjxupw3kyystr3wvedu5g5dhom/
  // 500(已开) + 2000(盲盒)
  // ipfs://bafybeiejoqlmxtbmljgfqsjvryzrwuonlge76yp7xmq6gnovntbfpgxroa/
  // 500(已开) + 2000(已开)
  // ipfs://bafybeihtiiabfen23czqhfttvzimybyyw6gdwdnaiqwqo4zwfsy7r5arwm/
  const uriPrefix = process.env.COLLECTION_URI_PREFIX;
  if (
    undefined === process.env.COLLECTION_URI_PREFIX ||
    process.env.COLLECTION_URI_PREFIX === "ipfs://__CID___/"
  ) {
    throw new Error(
      "\x1b[31merror\x1b[0m " +
        "Please add the URI prefix to the ENV configuration before running this command."
    );
  }

  if (uriPrefix?.charAt(uriPrefix.length - 1) !== "/") {
    throw new Error('COLLECTION_URI_PREFIX 结尾要为 "/" ');
  }

  const contract = await NftContractProvider.getContract();
  // console.log(await contract.hiddenMetadataUri());
  // console.log(await contract.uriPrefix());
  // console.log(await contract.uriSuffix());
  // console.log(await contract.tokenURI(501));

  // Update URI prefix (if changed)
  if ((await contract.uriPrefix()) !== uriPrefix) {
    console.log(`Updating the URI prefix to: ${uriPrefix}`);
    await (await contract.setUriPrefix(uriPrefix as string)).wait();
  }

  console.log("Ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
