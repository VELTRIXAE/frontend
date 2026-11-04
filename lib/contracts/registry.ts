import { contractRegistry, isWriteEnabled, networkPassphrase } from "@/lib/config";

export function getContractRegistryStatus() {
  const entries = [contractRegistry.swap, contractRegistry.factory, contractRegistry.router];
  const wrongNetwork = entries.some(
    (entry) => entry.contractId !== "" && entry.networkPassphrase !== networkPassphrase,
  );
  return { verified: isWriteEnabled(), wrongNetwork };
}
