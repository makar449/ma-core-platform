import type { Exchange } from "@ma-core/shared";

export interface ApiKeyPermissionSnapshot {
  exchange: Exchange;
  canRead: boolean;
  canTradeSpot: boolean;
  canTradeDerivatives: boolean;
  canWithdraw: boolean;
  canTransfer: boolean;
  canManageSubaccounts: boolean;
  canBroker: boolean;
  unknownSensitivePermissions: readonly string[];
  raw: Record<string, unknown>;
}

export interface PermissionValidationResult {
  accepted: boolean;
  reason: string;
  snapshot: ApiKeyPermissionSnapshot;
}

export function validateExchangePermissions(snapshot: ApiKeyPermissionSnapshot): PermissionValidationResult {
  if (!snapshot.canRead) {
    return { accepted: false, reason: "API-ключ не имеет права чтения баланса и ордеров.", snapshot };
  }
  if (!snapshot.canTradeSpot && !snapshot.canTradeDerivatives) {
    return { accepted: false, reason: "API-ключ должен иметь торговые права Spot или Derivatives без права вывода средств.", snapshot };
  }
  if (snapshot.canWithdraw) {
    return { accepted: false, reason: "API-ключ имеет право Withdraw. Система отклоняет такие ключи fail-closed.", snapshot };
  }
  if (snapshot.canTransfer) {
    return { accepted: false, reason: "API-ключ имеет transfer-доступ. Для защиты средств разрешены только Read и Trade.", snapshot };
  }
  if (snapshot.canManageSubaccounts) {
    return { accepted: false, reason: "API-ключ имеет права управления subaccount. Система принимает только Read/Trade ключи.", snapshot };
  }
  if (snapshot.canBroker) {
    return { accepted: false, reason: "API-ключ имеет broker/account-management права. Интеграция отклонена fail-closed.", snapshot };
  }
  if (snapshot.unknownSensitivePermissions.length > 0) {
    return { accepted: false, reason: `Найдены непонятные чувствительные права: ${snapshot.unknownSensitivePermissions.join(", ")}. Интеграция отклонена fail-closed.`, snapshot };
  }
  return { accepted: true, reason: "Ключ прошел проверку прав: Read/Trade разрешены, Withdraw/Transfer/Subaccount/Broker отсутствуют.", snapshot };
}
