import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

const STANDARD_UNIT_PRICE = 500_000_000_000_000n;
const FALLBACK_UNIT_PRICE = 700_000_000_000_000n;

async function fixture() {
  const [owner, treasury, authorizedSigner, user, wrongSigner] = await ethers.getSigners();
  const token = (await ethers.deployContract("SUMMONToken", [
    ethers.parseUnits("1000000000", 18)
  ])) as any;
  const manager = (await ethers.deployContract("MintManager", [
    await token.getAddress(),
    treasury.address,
    authorizedSigner.address
  ])) as any;
  await token.setMinter(await manager.getAddress());
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = {
    name: "SUMMON MintManager",
    version: "1",
    chainId,
    verifyingContract: await manager.getAddress()
  };

  return { owner, treasury, authorizedSigner, user, wrongSigner, token, manager, domain };
}

function hashText(value: string) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

async function signMintWithTweet(input: {
  signer: any;
  domain: Record<string, unknown>;
  user: string;
  tweetId: string;
  nonce: string;
  shareUnits: bigint;
  deadline: bigint;
}) {
  return input.signer.signTypedData(
    input.domain,
    {
      MintWithTweet: [
        { name: "user", type: "address" },
        { name: "tweetIdHash", type: "bytes32" },
        { name: "nonceHash", type: "bytes32" },
        { name: "shareUnits", type: "uint256" },
        { name: "pricePerUnitWei", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    {
      user: input.user,
      tweetIdHash: hashText(input.tweetId),
      nonceHash: hashText(input.nonce),
      shareUnits: input.shareUnits,
      pricePerUnitWei: STANDARD_UNIT_PRICE,
      deadline: input.deadline
    }
  );
}

async function signFallback(input: {
  signer: any;
  domain: Record<string, unknown>;
  user: string;
  nonce: string;
  shareUnits: bigint;
  deadline: bigint;
}) {
  return input.signer.signTypedData(
    input.domain,
    {
      FallbackMint: [
        { name: "user", type: "address" },
        { name: "nonceHash", type: "bytes32" },
        { name: "shareUnits", type: "uint256" },
        { name: "pricePerUnitWei", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    {
      user: input.user,
      nonceHash: hashText(input.nonce),
      shareUnits: input.shareUnits,
      pricePerUnitWei: FALLBACK_UNIT_PRICE,
      deadline: input.deadline
    }
  );
}

async function signFree(input: {
  signer: any;
  domain: Record<string, unknown>;
  user: string;
  xUserId: string;
  nonce: string;
  deadline: bigint;
}) {
  return input.signer.signTypedData(
    input.domain,
    {
      FreeClaim: [
        { name: "user", type: "address" },
        { name: "xUserIdHash", type: "bytes32" },
        { name: "nonceHash", type: "bytes32" },
        { name: "shareUnits", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    {
      user: input.user,
      xUserIdHash: hashText(input.xUserId),
      nonceHash: hashText(input.nonce),
      shareUnits: 1n,
      deadline: input.deadline
    }
  );
}

async function futureDeadline() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt((block?.timestamp ?? 0) + 3600);
}

describe("MintManager", function () {
  it("X_POST mints 10 shares and sends ETH to treasury", async function () {
    const { treasury, authorizedSigner, user, token, manager, domain } = await fixture();
    const shareUnits = 100n;
    const deadline = await futureDeadline();
    const signature = await signMintWithTweet({
      signer: authorizedSigner,
      domain,
      user: user.address,
      tweetId: "1234567890123456789",
      nonce: "SUMMON-ABC123",
      shareUnits,
      deadline
    });

    const value = shareUnits * STANDARD_UNIT_PRICE;
    const tx = manager
      .connect(user)
      .mintWithTweet(user.address, "1234567890123456789", "SUMMON-ABC123", shareUnits, deadline, signature, {
        value
      });
    await expect(tx).to.emit(manager, "SummonMinted");
    await expect(tx).to.changeEtherBalance(treasury, value);

    expect(await token.balanceOf(user.address)).to.equal(ethers.parseUnits("10000000", 18));
    expect(await manager.totalShareUnitsMinted()).to.equal(shareUnits);
  });

  it("fallback mints 20 shares", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const shareUnits = 200n;
    const deadline = await futureDeadline();
    const signature = await signFallback({
      signer: authorizedSigner,
      domain,
      user: user.address,
      nonce: "FALLBACK-1",
      shareUnits,
      deadline
    });

    await expect(
      manager.connect(user).mintFallback(user.address, "FALLBACK-1", shareUnits, deadline, signature, {
        value: shareUnits * FALLBACK_UNIT_PRICE
      })
    ).to.emit(manager, "FallbackMinted");

    const stats = await manager.walletStats(user.address);
    expect(stats.paidFallbackUnits).to.equal(shareUnits);
  });

  it("free claim mints 0.1 share", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const deadline = await futureDeadline();
    const signature = await signFree({
      signer: authorizedSigner,
      domain,
      user: user.address,
      xUserId: "x-1",
      nonce: "FREE-1",
      deadline
    });

    await expect(
      manager.connect(user).claimFreeWithX(user.address, "x-1", "FREE-1", deadline, signature)
    ).to.emit(manager, "FreeClaimed");

    const stats = await manager.walletStats(user.address);
    expect(stats.freeUnitsClaimed).to.equal(1n);
  });

  it("rejects duplicate tweetId", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const deadline = await futureDeadline();
    const sig1 = await signMintWithTweet({
      signer: authorizedSigner,
      domain,
      user: user.address,
      tweetId: "tweet-1",
      nonce: "nonce-1",
      shareUnits: 10n,
      deadline
    });
    await manager.connect(user).mintWithTweet(user.address, "tweet-1", "nonce-1", 10n, deadline, sig1, {
      value: 10n * STANDARD_UNIT_PRICE
    });
    const sig2 = await signMintWithTweet({
      signer: authorizedSigner,
      domain,
      user: user.address,
      tweetId: "tweet-1",
      nonce: "nonce-2",
      shareUnits: 10n,
      deadline
    });
    await expect(
      manager.connect(user).mintWithTweet(user.address, "tweet-1", "nonce-2", 10n, deadline, sig2, {
        value: 10n * STANDARD_UNIT_PRICE
      })
    ).to.be.revertedWith("TWEET_ALREADY_USED");
  });

  it("rejects duplicate nonce", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const deadline = await futureDeadline();
    const sig = await signFallback({
      signer: authorizedSigner,
      domain,
      user: user.address,
      nonce: "dup-nonce",
      shareUnits: 10n,
      deadline
    });
    await manager.connect(user).mintFallback(user.address, "dup-nonce", 10n, deadline, sig, {
      value: 10n * FALLBACK_UNIT_PRICE
    });
    await expect(
      manager.connect(user).mintFallback(user.address, "dup-nonce", 10n, deadline, sig, {
        value: 10n * FALLBACK_UNIT_PRICE
      })
    ).to.be.revertedWith("NONCE_ALREADY_USED");
  });

  it("rejects standard mint above 100 shares", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const deadline = await futureDeadline();
    const signature = await signMintWithTweet({
      signer: authorizedSigner,
      domain,
      user: user.address,
      tweetId: "tweet-over-standard",
      nonce: "nonce-over-standard",
      shareUnits: 1001n,
      deadline
    });
    await expect(
      manager
        .connect(user)
        .mintWithTweet(user.address, "tweet-over-standard", "nonce-over-standard", 1001n, deadline, signature, {
          value: 1001n * STANDARD_UNIT_PRICE
        })
    ).to.be.revertedWith("STANDARD_LIMIT");
  });

  it("rejects fallback above 20 shares", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const deadline = await futureDeadline();
    const signature = await signFallback({
      signer: authorizedSigner,
      domain,
      user: user.address,
      nonce: "fallback-over",
      shareUnits: 201n,
      deadline
    });
    await expect(
      manager.connect(user).mintFallback(user.address, "fallback-over", 201n, deadline, signature, {
        value: 201n * FALLBACK_UNIT_PRICE
      })
    ).to.be.revertedWith("FALLBACK_LIMIT");
  });

  it("rejects total cap overflow", async function () {
    const { authorizedSigner, owner, user, manager, domain } = await fixture();
    await manager.connect(owner).setCaps(1n, 1000n, 200n);
    const deadline = await futureDeadline();
    const signature = await signFallback({
      signer: authorizedSigner,
      domain,
      user: user.address,
      nonce: "cap-over",
      shareUnits: 2n,
      deadline
    });
    await expect(
      manager.connect(user).mintFallback(user.address, "cap-over", 2n, deadline, signature, {
        value: 2n * FALLBACK_UNIT_PRICE
      })
    ).to.be.revertedWith("TOTAL_CAP");
  });

  it("rejects incorrect msg.value", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const deadline = await futureDeadline();
    const signature = await signFallback({
      signer: authorizedSigner,
      domain,
      user: user.address,
      nonce: "bad-payment",
      shareUnits: 10n,
      deadline
    });
    await expect(
      manager.connect(user).mintFallback(user.address, "bad-payment", 10n, deadline, signature, {
        value: 1n
      })
    ).to.be.revertedWith("BAD_PAYMENT");
  });

  it("rejects signatures from the wrong signer", async function () {
    const { wrongSigner, user, manager, domain } = await fixture();
    const deadline = await futureDeadline();
    const signature = await signFallback({
      signer: wrongSigner,
      domain,
      user: user.address,
      nonce: "wrong-signer",
      shareUnits: 10n,
      deadline
    });
    await expect(
      manager.connect(user).mintFallback(user.address, "wrong-signer", 10n, deadline, signature, {
        value: 10n * FALLBACK_UNIT_PRICE
      })
    ).to.be.revertedWith("INVALID_SIGNATURE");
  });

  it("rejects expired authorizations", async function () {
    const { authorizedSigner, user, manager, domain } = await fixture();
    const block = await ethers.provider.getBlock("latest");
    const deadline = BigInt((block?.timestamp ?? 0) - 1);
    const signature = await signFallback({
      signer: authorizedSigner,
      domain,
      user: user.address,
      nonce: "expired",
      shareUnits: 10n,
      deadline
    });
    await expect(
      manager.connect(user).mintFallback(user.address, "expired", 10n, deadline, signature, {
        value: 10n * FALLBACK_UNIT_PRICE
      })
    ).to.be.revertedWith("AUTH_EXPIRED");
  });

  it("rejects minting while paused", async function () {
    const { authorizedSigner, owner, user, manager, domain } = await fixture();
    await manager.connect(owner).setPaused(true);
    const deadline = await futureDeadline();
    const signature = await signFallback({
      signer: authorizedSigner,
      domain,
      user: user.address,
      nonce: "paused",
      shareUnits: 10n,
      deadline
    });
    await expect(
      manager.connect(user).mintFallback(user.address, "paused", 10n, deadline, signature, {
        value: 10n * FALLBACK_UNIT_PRICE
      })
    ).to.be.revertedWith("PAUSED");
  });
});
