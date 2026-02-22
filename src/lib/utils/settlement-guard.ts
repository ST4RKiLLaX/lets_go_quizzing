export function createSettlementGuard(onSettle: () => void): () => boolean {
  let settled = false;
  return () => {
    if (settled) return false;
    settled = true;
    onSettle();
    return true;
  };
}
