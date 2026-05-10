export const mintManagerAbi = [
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "authorizedSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "totalShareUnitsMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "totalShareUnitsCap",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "standardPricePerUnitWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "fallbackPricePerUnitWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "maxStandardUnitsPerWallet",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "maxFallbackUnitsPerWallet",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "freeShareUnits",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "walletStats",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "paidStandardUnits", type: "uint256" },
      { name: "paidFallbackUnits", type: "uint256" },
      { name: "freeUnitsClaimed", type: "uint256" },
      { name: "totalUnitsMinted", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "mintWithTweet",
    stateMutability: "payable",
    inputs: [
      { name: "user", type: "address" },
      { name: "tweetId", type: "string" },
      { name: "nonce", type: "string" },
      { name: "shareUnits", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "mintFallback",
    stateMutability: "payable",
    inputs: [
      { name: "user", type: "address" },
      { name: "nonce", type: "string" },
      { name: "shareUnits", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "claimFreeWithX",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "xUserId", type: "string" },
      { name: "nonce", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  }
] as const;
