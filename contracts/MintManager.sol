// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISUMMONToken {
    function mint(address to, uint256 amount) external;
}

contract MintManager {
    struct WalletStats {
        uint256 paidStandardUnits;
        uint256 paidFallbackUnits;
        uint256 freeUnitsClaimed;
        uint256 totalUnitsMinted;
    }

    ISUMMONToken public immutable token;
    address public owner;
    address public treasury;
    address public authorizedSigner;
    bool public paused;

    uint256 public constant shareUnitDecimals = 10;
    uint256 public totalShareUnitsCap = 210_000;
    uint256 public totalShareUnitsMinted;
    uint256 public standardPricePerUnitWei = 500_000_000_000_000;
    uint256 public fallbackPricePerUnitWei = 700_000_000_000_000;
    uint256 public freeShareUnits = 1;
    uint256 public maxStandardUnitsPerWallet = 1_000;
    uint256 public maxFallbackUnitsPerWallet = 200;
    uint256 public tokenAmountPerShare = 1_000_000 ether;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("SUMMON MintManager");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant MINT_WITH_TWEET_TYPEHASH =
        keccak256(
            "MintWithTweet(address user,bytes32 tweetIdHash,bytes32 nonceHash,uint256 shareUnits,uint256 pricePerUnitWei,uint256 deadline)"
        );
    bytes32 private constant FALLBACK_TYPEHASH =
        keccak256(
            "FallbackMint(address user,bytes32 nonceHash,uint256 shareUnits,uint256 pricePerUnitWei,uint256 deadline)"
        );
    bytes32 private constant FREE_CLAIM_TYPEHASH =
        keccak256("FreeClaim(address user,bytes32 xUserIdHash,bytes32 nonceHash,uint256 shareUnits,uint256 deadline)");

    mapping(bytes32 => bool) public usedTweetIds;
    mapping(bytes32 => bool) public usedNonces;
    mapping(bytes32 => bool) public usedXUserIdsForFreeClaim;
    mapping(address => WalletStats) public walletStats;

    uint256 private locked = 1;

    event SummonMinted(
        address indexed user,
        bytes32 indexed tweetIdHash,
        string tweetId,
        string nonce,
        uint256 shareUnits,
        uint256 paidWei,
        string mode,
        uint256 timestamp
    );
    event FallbackMinted(
        address indexed user,
        string nonce,
        uint256 shareUnits,
        uint256 paidWei,
        uint256 timestamp
    );
    event FreeClaimed(
        address indexed user,
        string xUserId,
        string nonce,
        uint256 shareUnits,
        uint256 timestamp
    );
    event TreasuryUpdated(address treasury);
    event AuthorizedSignerUpdated(address authorizedSigner);
    event PausedUpdated(bool paused);
    event PricesUpdated(uint256 standardPricePerUnitWei, uint256 fallbackPricePerUnitWei);
    event CapsUpdated(uint256 totalShareUnitsCap, uint256 maxStandardUnitsPerWallet, uint256 maxFallbackUnitsPerWallet);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    modifier nonReentrant() {
        require(locked == 1, "REENTRANT");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address token_, address treasury_, address authorizedSigner_) {
        require(token_ != address(0), "ZERO_TOKEN");
        require(treasury_ != address(0), "ZERO_TREASURY");
        require(authorizedSigner_ != address(0), "ZERO_SIGNER");
        token = ISUMMONToken(token_);
        owner = msg.sender;
        treasury = treasury_;
        authorizedSigner = authorizedSigner_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryUpdated(treasury_);
        emit AuthorizedSignerUpdated(authorizedSigner_);
    }

    function mintWithTweet(
        address user,
        string calldata tweetId,
        string calldata nonce,
        uint256 shareUnits,
        uint256 deadline,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(block.timestamp <= deadline, "AUTH_EXPIRED");
        require(user != address(0), "ZERO_USER");
        require(bytes(tweetId).length > 0, "EMPTY_TWEET_ID");
        require(bytes(nonce).length > 0, "EMPTY_NONCE");
        require(shareUnits > 0, "INVALID_UNITS");

        bytes32 tweetIdHash = keccak256(bytes(tweetId));
        bytes32 nonceHash = keccak256(bytes(nonce));
        require(!usedTweetIds[tweetIdHash], "TWEET_ALREADY_USED");
        require(!usedNonces[nonceHash], "NONCE_ALREADY_USED");
        require(totalShareUnitsMinted + shareUnits <= totalShareUnitsCap, "TOTAL_CAP");
        require(
            walletStats[user].paidStandardUnits + shareUnits <= maxStandardUnitsPerWallet,
            "STANDARD_LIMIT"
        );
        require(msg.value == shareUnits * standardPricePerUnitWei, "BAD_PAYMENT");

        bytes32 structHash = keccak256(
            abi.encode(
                MINT_WITH_TWEET_TYPEHASH,
                user,
                tweetIdHash,
                nonceHash,
                shareUnits,
                standardPricePerUnitWei,
                deadline
            )
        );
        _verifyTypedData(structHash, signature);

        usedTweetIds[tweetIdHash] = true;
        usedNonces[nonceHash] = true;
        WalletStats storage stats = walletStats[user];
        stats.paidStandardUnits += shareUnits;
        _recordAndMint(user, shareUnits);
        _forwardEth();

        emit SummonMinted(
            user,
            tweetIdHash,
            tweetId,
            nonce,
            shareUnits,
            msg.value,
            "X_POST",
            block.timestamp
        );
    }

    function mintFallback(
        address user,
        string calldata nonce,
        uint256 shareUnits,
        uint256 deadline,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(block.timestamp <= deadline, "AUTH_EXPIRED");
        require(user != address(0), "ZERO_USER");
        require(bytes(nonce).length > 0, "EMPTY_NONCE");
        require(shareUnits > 0, "INVALID_UNITS");

        bytes32 nonceHash = keccak256(bytes(nonce));
        require(!usedNonces[nonceHash], "NONCE_ALREADY_USED");
        require(totalShareUnitsMinted + shareUnits <= totalShareUnitsCap, "TOTAL_CAP");
        require(
            walletStats[user].paidFallbackUnits + shareUnits <= maxFallbackUnitsPerWallet,
            "FALLBACK_LIMIT"
        );
        require(msg.value == shareUnits * fallbackPricePerUnitWei, "BAD_PAYMENT");

        bytes32 structHash = keccak256(
            abi.encode(
                FALLBACK_TYPEHASH,
                user,
                nonceHash,
                shareUnits,
                fallbackPricePerUnitWei,
                deadline
            )
        );
        _verifyTypedData(structHash, signature);

        usedNonces[nonceHash] = true;
        WalletStats storage stats = walletStats[user];
        stats.paidFallbackUnits += shareUnits;
        _recordAndMint(user, shareUnits);
        _forwardEth();

        emit FallbackMinted(user, nonce, shareUnits, msg.value, block.timestamp);
    }

    function claimFreeWithX(
        address user,
        string calldata xUserId,
        string calldata nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused nonReentrant {
        require(block.timestamp <= deadline, "AUTH_EXPIRED");
        require(user != address(0), "ZERO_USER");
        require(bytes(xUserId).length > 0, "EMPTY_X_USER");
        require(bytes(nonce).length > 0, "EMPTY_NONCE");

        bytes32 xUserIdHash = keccak256(bytes(xUserId));
        bytes32 nonceHash = keccak256(bytes(nonce));
        require(!usedXUserIdsForFreeClaim[xUserIdHash], "X_FREE_ALREADY_USED");
        require(!usedNonces[nonceHash], "NONCE_ALREADY_USED");
        require(walletStats[user].freeUnitsClaimed == 0, "WALLET_FREE_ALREADY_CLAIMED");
        require(totalShareUnitsMinted + freeShareUnits <= totalShareUnitsCap, "TOTAL_CAP");

        bytes32 structHash = keccak256(
            abi.encode(
                FREE_CLAIM_TYPEHASH,
                user,
                xUserIdHash,
                nonceHash,
                freeShareUnits,
                deadline
            )
        );
        _verifyTypedData(structHash, signature);

        usedXUserIdsForFreeClaim[xUserIdHash] = true;
        usedNonces[nonceHash] = true;
        WalletStats storage stats = walletStats[user];
        stats.freeUnitsClaimed += freeShareUnits;
        _recordAndMint(user, freeShareUnits);

        emit FreeClaimed(user, xUserId, nonce, freeShareUnits, block.timestamp);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "ZERO_TREASURY");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setAuthorizedSigner(address authorizedSigner_) external onlyOwner {
        require(authorizedSigner_ != address(0), "ZERO_SIGNER");
        authorizedSigner = authorizedSigner_;
        emit AuthorizedSignerUpdated(authorizedSigner_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedUpdated(paused_);
    }

    function setPrices(uint256 standardPricePerUnitWei_, uint256 fallbackPricePerUnitWei_) external onlyOwner {
        require(standardPricePerUnitWei_ > 0, "BAD_STANDARD_PRICE");
        require(fallbackPricePerUnitWei_ > 0, "BAD_FALLBACK_PRICE");
        standardPricePerUnitWei = standardPricePerUnitWei_;
        fallbackPricePerUnitWei = fallbackPricePerUnitWei_;
        emit PricesUpdated(standardPricePerUnitWei_, fallbackPricePerUnitWei_);
    }

    function setCaps(
        uint256 totalShareUnitsCap_,
        uint256 maxStandardUnitsPerWallet_,
        uint256 maxFallbackUnitsPerWallet_
    ) external onlyOwner {
        require(totalShareUnitsCap_ >= totalShareUnitsMinted, "CAP_BELOW_MINTED");
        require(maxStandardUnitsPerWallet_ > 0, "BAD_STANDARD_CAP");
        require(maxFallbackUnitsPerWallet_ > 0, "BAD_FALLBACK_CAP");
        totalShareUnitsCap = totalShareUnitsCap_;
        maxStandardUnitsPerWallet = maxStandardUnitsPerWallet_;
        maxFallbackUnitsPerWallet = maxFallbackUnitsPerWallet_;
        emit CapsUpdated(totalShareUnitsCap_, maxStandardUnitsPerWallet_, maxFallbackUnitsPerWallet_);
    }

    function withdrawStuckETH(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "ZERO_TO");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "WITHDRAW_FAILED");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function _recordAndMint(address user, uint256 shareUnits) internal {
        totalShareUnitsMinted += shareUnits;
        WalletStats storage stats = walletStats[user];
        stats.totalUnitsMinted += shareUnits;
        uint256 tokenAmount = (shareUnits * tokenAmountPerShare) / shareUnitDecimals;
        token.mint(user, tokenAmount);
    }

    function _forwardEth() internal {
        if (msg.value == 0) return;
        (bool ok, ) = treasury.call{value: msg.value}("");
        require(ok, "TREASURY_TRANSFER_FAILED");
    }

    function _verifyTypedData(bytes32 structHash, bytes calldata signature) internal view {
        require(signature.length == 65, "BAD_SIGNATURE");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        require(_recover(digest, signature) == authorizedSigner, "INVALID_SIGNATURE");
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "BAD_V");
        return ecrecover(digest, v, r, s);
    }
}
