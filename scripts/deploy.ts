import hre from "hardhat";

const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const authorizedSigner = process.env.AUTHORIZED_SIGNER_ADDRESS || deployer.address;
  const tokenCap = ethers.parseUnits("1000000000000", 18);
  const token = await ethers.deployContract("SUMMONToken", [tokenCap]);
  await token.waitForDeployment();

  const manager = await ethers.deployContract("MintManager", [
    await token.getAddress(),
    treasury,
    authorizedSigner
  ]);
  await manager.waitForDeployment();

  await (await token.setMinter(await manager.getAddress())).wait();

  const network = await ethers.provider.getNetwork();
  console.log("SUMMONToken:", await token.getAddress());
  console.log("MintManager:", await manager.getAddress());
  console.log("owner:", deployer.address);
  console.log("treasury:", treasury);
  console.log("authorizedSigner:", authorizedSigner);
  console.log("chainId:", network.chainId.toString());
  console.log("standardPricePerUnitWei:", (await manager.standardPricePerUnitWei()).toString());
  console.log("fallbackPricePerUnitWei:", (await manager.fallbackPricePerUnitWei()).toString());
  console.log("totalShareUnitsCap:", (await manager.totalShareUnitsCap()).toString());
  console.log("maxStandardUnitsPerWallet:", (await manager.maxStandardUnitsPerWallet()).toString());
  console.log("maxFallbackUnitsPerWallet:", (await manager.maxFallbackUnitsPerWallet()).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
