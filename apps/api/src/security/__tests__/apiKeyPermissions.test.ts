import { describe, expect, it } from "vitest";
import { validateExchangePermissions, type ApiKeyPermissionSnapshot } from "../apiKeyPermissions.js";

const base: ApiKeyPermissionSnapshot = {
  exchange: "BINANCE",
  canRead: true,
  canTradeSpot: true,
  canTradeDerivatives: false,
  canWithdraw: false,
  canTransfer: false,
  canManageSubaccounts: false,
  canBroker: false,
  unknownSensitivePermissions: [],
  raw: {}
};

describe("validateExchangePermissions", () => {
  it("accepts read and trade only", () => {
    expect(validateExchangePermissions(base).accepted).toBe(true);
  });

  it("rejects withdrawal permissions", () => {
    expect(validateExchangePermissions({ ...base, canWithdraw: true }).accepted).toBe(false);
  });

  it("rejects unknown sensitive permissions", () => {
    expect(validateExchangePermissions({ ...base, unknownSensitivePermissions: ["enableMysteryTransfer"] }).accepted).toBe(false);
  });
});
