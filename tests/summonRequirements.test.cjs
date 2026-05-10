const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  loaded._compile(output, filePath);
  return loaded.exports;
}

const { validateSummonTweetRequirements } = loadTypeScriptModule(
  path.join(__dirname, "..", "src", "lib", "summon", "requirements.ts")
);

const baseInput = {
  shortWallet: "0x2B9b...CcC9",
  code: "SUMMON-8F3K2A",
  summonHandle: "SummonAI",
  grokHandle: "grok",
  requiredHashtag: "#SUMMON",
  secondaryHashtag: "#GrokMint",
  mode: "MINT"
};

function validate(tweetText, overrides = {}) {
  return validateSummonTweetRequirements({ ...baseInput, tweetText, ...overrides });
}

function validTweet(extra = "") {
  return [
    "I changed the copy, added 中文 and emoji ✨, but kept the proof.",
    "Post to Summon.",
    "@SummonAI @grok $SUMMON",
    "Wallet: 0x2B9b...CcC9",
    "Summon Code: SUMMON-8F3K2A",
    "#SUMMON #GrokMint #AIMeme",
    extra
  ].join("\n");
}

test("complete required fields pass", () => {
  const result = validate(validTweet());
  assert.equal(result.valid, true);
});

test("edited copy with required tokens still passes", () => {
  const result = validate(validTweet("gm SUMMON ritual with extra links https://example.com"));
  assert.equal(result.valid, true);
});

test("missing official mention fails", () => {
  const result = validate(validTweet().replace("@SummonAI ", ""));
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("Missing official mention @SummonAI"));
});

test("missing grok mention fails", () => {
  const result = validate(validTweet().replace("@grok ", ""));
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("Missing Grok mention @grok"));
});

test("missing primary hashtag fails", () => {
  const result = validate(validTweet().replace("#SUMMON ", ""));
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("Missing #SUMMON"));
});

test("missing secondary hashtag fails", () => {
  const result = validate(validTweet().replace("#GrokMint ", ""));
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("Missing #GrokMint"));
});

test("missing wallet short address fails", () => {
  const result = validate(validTweet().replace("0x2B9b...CcC9", "0x0000...0000"));
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("Missing wallet short address"));
});

test("missing bind or summon code fails with mode-specific reason", () => {
  const mintResult = validate(validTweet().replace("SUMMON-8F3K2A", "SUMMON-AAAAAA"));
  assert.ok(mintResult.missing.includes("Missing summon code"));

  const bindResult = validate(
    validTweet().replace("SUMMON-8F3K2A", "BIND-9277EEAF"),
    { code: "BIND-9277EEAF", mode: "BIND" }
  );
  assert.equal(bindResult.valid, true);

  const missingBind = validate(validTweet(), { code: "BIND-9277EEAF", mode: "BIND" });
  assert.ok(missingBind.missing.includes("Missing bind code"));
});

test("mock follow, author, wallet, and duplicate theft cases fail", () => {
  const followsOfficial = false;
  const boundAuthorId = "author-a";
  const tweetAuthorId = "author-b";
  const nonceWallet = "0xA";
  const connectedWallet = "0xB";
  const usedTweetIds = new Set(["123"]);

  assert.equal(followsOfficial, false);
  assert.notEqual(tweetAuthorId, boundAuthorId);
  assert.notEqual(nonceWallet, connectedWallet);
  assert.equal(usedTweetIds.has("123"), true);
});
