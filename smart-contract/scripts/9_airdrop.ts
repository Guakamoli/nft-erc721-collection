import NftContractProvider from '../lib/NftContractProvider';
import airdropAddresses from '../config/airdrops.json';

async function main() {
  // Attach to deployed contract
  const contract = await NftContractProvider.getContract();

  // Airdrop mints
  for (let i = 0; i < airdropAddresses.length; i += 100) {
    console.log('Airdroping...');
    let batchAddrs = airdropAddresses.slice(i, i + 100);
    await (await contract.airdrop(1, batchAddrs)).wait();
  }

  console.log('Your collection is airdroped!');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
