import hre from "hardhat";

const { ethers } = hre;

async function verify(address: string, constructorArguments: unknown[]) {
  try {
    await hre.run("verify:verify", { address, constructorArguments });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("already verified")) {
      console.log(`${address} already verified`);
      return;
    }
    throw error;
  }
}

async function main() {
  const tokenAddress = process.env.SUMMON_TOKEN_ADDRESS;
  const mintManagerAddress = process.env.MINT_MANAGER_ADDRESS;
  const treasury = process.env.TREASURY_ADDRESS;
  const authorizedSigner = process.env.AUTHORIZED_SIGNER_ADDRESS;

  if (!tokenAddress) throw new Error("SUMMON_TOKEN_ADDRESS is required");
  if (!mintManagerAddress) throw new Error("MINT_MANAGER_ADDRESS is required");
  if (!treasury) throw new Error("TREASURY_ADDRESS is required");
  if (!authorizedSigner) throw new Error("AUTHORIZED_SIGNER_ADDRESS is required");

  const tokenCap = ethers.parseUnits("1000000000000", 18);
  await verify(tokenAddress, [tokenCap]);
  await verify(mintManagerAddress, [tokenAddress, treasury, authorizedSigner]);

  console.log("Verified SUMMONToken:", tokenAddress);
  console.log("Verified MintManager:", mintManagerAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
