import { describe, expect, it } from "vitest";
import { ApiWalletVault } from "../vault.js";

const master = Buffer.from("0".repeat(32), "utf8").toString("base64");

describe("ApiWalletVault", () => {
  it("encrypts and decrypts with user and exchange AAD", () => {
    const vault = new ApiWalletVault(master, "v1");
    const encrypted = vault.encrypt({ apiKey: "key-123456", apiSecret: "secret-1234567890123456" }, { userId: "user_a", exchange: "BINANCE" });
    expect(encrypted.ciphertext).not.toContain("secret");
    expect(vault.decrypt(encrypted, { userId: "user_a", exchange: "BINANCE" }).apiKey).toBe("key-123456");
  });

  it("rejects decrypting the same blob under a different user", () => {
    const vault = new ApiWalletVault(master, "v1");
    const encrypted = vault.encrypt({ apiKey: "key-abcdef", apiSecret: "secret-abcdef123456789" }, { userId: "user_a", exchange: "BYBIT" });
    expect(() => vault.decrypt(encrypted, { userId: "user_b", exchange: "BYBIT" })).toThrow();
  });
});
