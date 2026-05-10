export type Summon7702Authorization = {
  walletAddress: `0x${string}`;
  delegateAddress: `0x${string}`;
  expiresAt: number;
};

export async function prepareSummon7702Authorization(
  _authorization: Summon7702Authorization
) {
  throw new Error("EIP-7702 delegate flow is reserved for phase two and is not enabled in MVP.");
}

