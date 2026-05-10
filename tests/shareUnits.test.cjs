const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const target = path.join(root, "src", request.slice(2));
    for (const candidate of [target, `${target}.ts`, `${target}.tsx`, `${target}.js`]) {
      if (fs.existsSync(candidate)) return candidate;
    }
    for (const candidate of [
      path.join(target, "index.ts"),
      path.join(target, "index.tsx"),
      path.join(target, "index.js")
    ]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  formatUnitsToShares,
  getMaxInputShares,
  parseSharesToUnits
} = require("../src/lib/mint/shareUnits.ts");

const { getMockStore } = require("../src/lib/summon/mockStore.ts");
const { POST: prepareMintPost } = require("../src/app/api/summon/prepare-mint/route.ts");
const { POST: mintPost } = require("../src/app/api/summon/mint/route.ts");

function request(body) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function resetMockStore() {
  const store = getMockStore();
  store.nonces.clear();
  store.verifications.clear();
  store.mints.clear();
  store.bindingsByWallet.clear();
  store.bindingsByXUserId.clear();
  store.bindStarts.clear();
  store.preparedMints.clear();
  store.walletStats.clear();
  store.globalStats.totalShareUnitsMinted = 0;
  store.globalStats.totalPaidWei = "0";
  return store;
}

test("parseSharesToUnits accepts 0.1 increments", () => {
  assert.equal(parseSharesToUnits("0.1"), 1);
  assert.equal(parseSharesToUnits("1"), 10);
  assert.equal(parseSharesToUnits("1.5"), 15);
});

test("parseSharesToUnits rejects unsafe share inputs", () => {
  assert.throws(() => parseSharesToUnits("1.23"));
  assert.throws(() => parseSharesToUnits("0"));
  assert.throws(() => parseSharesToUnits("-1"));
});

test("max input respects wallet remaining and total remaining", () => {
  const config = {
    standardPricePerUnitWei: "500000000000000",
    fallbackPricePerUnitWei: "700000000000000",
    maxStandardShareUnits: 1000,
    maxFallbackShareUnits: 200,
    totalShareUnitsCap: 210000
  };
  assert.equal(
    getMaxInputShares("X_POST", { remainingStandardShares: "37.5" }, config, 0),
    "37.5"
  );
  assert.equal(
    getMaxInputShares("X_POST", { remainingStandardShares: "100" }, config, 209877),
    "12.3"
  );
});

test("prepare-mint rejects mode max and total cap overages", async () => {
  process.env.ENABLE_MOCK_MINT = "true";
  delete process.env.DATABASE_URL;
  resetMockStore();
  const walletAddress = "0x0000000000000000000000000000000000000001";

  const fallbackOver = await prepareMintPost(
    request({ walletAddress, mode: "NO_X_FALLBACK", shares: "20.1" })
  );
  assert.equal(fallbackOver.status, 400);
  assert.equal((await fallbackOver.json()).error, "MODE_MAX_EXCEEDED");

  const store = resetMockStore();
  store.globalStats.totalShareUnitsMinted = 209877;
  const totalOver = await prepareMintPost(
    request({ walletAddress, mode: "NO_X_FALLBACK", shares: "13" })
  );
  assert.equal(totalOver.status, 400);
  assert.equal((await totalOver.json()).error, "TOTAL_CAP_EXCEEDED");
});

test("mint API rejects requests that do not match prepared shareUnits", async () => {
  process.env.ENABLE_MOCK_MINT = "true";
  delete process.env.DATABASE_URL;
  const store = resetMockStore();
  const walletAddress = "0x0000000000000000000000000000000000000001";
  store.preparedMints.set("prepared-1", {
    prepareId: "prepared-1",
    walletAddress,
    mode: "NO_X_FALLBACK",
    shareUnits: 10,
    nonce: "FALLBACK-test",
    totalWei: "7000000000000000",
    deadline: 123,
    used: false,
    createdAt: new Date()
  });

  const response = await mintPost(
    request({
      walletAddress,
      mode: "NO_X_FALLBACK",
      prepareId: "prepared-1",
      shares: "10",
      shareUnits: "100",
      nonce: "FALLBACK-test",
      deadline: 123,
      valueWei: "70000000000000000",
      userSignature: "0x00"
    })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "PREPARE_MISMATCH");
  assert.equal(formatUnitsToShares(123), "12.3");
});
