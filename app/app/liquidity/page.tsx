"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Droplets, Info, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PoolAsset = {
  code: string;
  issuer?: string;
  balance?: string;
};

type Pool = {
  id: string;
  contractId: string;
  verified: boolean;
  feeBps: number;
  reserveA: string;
  reserveB: string;
  totalShares: string;
  assetA: PoolAsset;
  assetB: PoolAsset;
};

type Preview = {
  amounts: { a: string; b: string };
  poolShare: string;
  fee: string;
  contract: string;
  minOutputs: { a: string; b: string };
  warnings: string[];
};

type SimulationResult = {
  ok: boolean;
  error?: string;
  errorCode?: "INSUFFICIENT_BALANCE" | "TRUSTLINE_MISSING" | "UNVERIFIED_CONTRACT" | "SIMULATION_FAILED" | "UNKNOWN";
  preview?: Preview;
};

type TxStatus = "idle" | "simulating" | "signing" | "submitting" | "success" | "failed";

const REGISTRY_VERIFIED = true;

function formatAmount(value: string | number, decimals = 7): string {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function safeNumber(value: string | undefined): number {
  const num = Number(value ?? "0");
  return Number.isFinite(num) ? num : 0;
}

function computeAddPreview(pool: Pool, amountA: string, amountB: string): Preview {
  const reserveA = safeNumber(pool.reserveA);
  const reserveB = safeNumber(pool.reserveB);
  const totalShares = safeNumber(pool.totalShares);
  const a = safeNumber(amountA);
  const b = safeNumber(amountB);

  const ratio = reserveA > 0 ? reserveB / reserveA : 0;
  const expectedB = a * ratio;
  const expectedA = ratio > 0 ? b / ratio : 0;

  const shareFromA = reserveA > 0 ? (a / reserveA) * totalShares : 0;
  const shareFromB = reserveB > 0 ? (b / reserveB) * totalShares : 0;
  const poolShare = Math.min(shareFromA, shareFromB);

  const fee = (a + b) * (pool.feeBps / 10000);
  const minA = a * 0.995;
  const minB = b * 0.995;

  const warnings: string[] = [];
  if (a > 0 && b > 0 && Math.abs(a - expectedA) / Math.max(a, 1) > 0.01) {
    warnings.push(`Deposit ratio mismatch: expected ${formatAmount(expectedA)} ${pool.assetA.code} for ${formatAmount(b)} ${pool.assetB.code}.`);
  }

  return {
    amounts: { a: formatAmount(a), b: formatAmount(b) },
    poolShare: formatAmount(poolShare),
    fee: formatAmount(fee),
    contract: pool.contractId,
    minOutputs: { a: formatAmount(minA), b: formatAmount(minB) },
    warnings,
  };
}

function computeRemovePreview(pool: Pool, shares: string): Preview {
  const totalShares = safeNumber(pool.totalShares);
  const reserveA = safeNumber(pool.reserveA);
  const reserveB = safeNumber(pool.reserveB);
  const s = safeNumber(shares);

  const fraction = totalShares > 0 ? s / totalShares : 0;
  const outA = reserveA * fraction;
  const outB = reserveB * fraction;
  const fee = (outA + outB) * (pool.feeBps / 10000);

  return {
    amounts: { a: formatAmount(outA), b: formatAmount(outB) },
    poolShare: formatAmount(fraction * 100),
    fee: formatAmount(fee),
    contract: pool.contractId,
    minOutputs: { a: formatAmount(outA * 0.995), b: formatAmount(outB * 0.995) },
    warnings: [],
  };
}

async function simulateAdd(pool: Pool, amountA: string, amountB: string): Promise<SimulationResult> {
  if (!pool.verified || !REGISTRY_VERIFIED) {
    return { ok: false, errorCode: "UNVERIFIED_CONTRACT", error: "This pool contract is not registry-verified and cannot be called." };
  }
  const a = safeNumber(amountA);
  const b = safeNumber(amountB);
  if (a <= 0 || b <= 0) {
    return { ok: false, errorCode: "SIMULATION_FAILED", error: "Enter positive amounts for both assets." };
  }
  const balA = safeNumber(pool.assetA.balance);
  const balB = safeNumber(pool.assetB.balance);
  if (a > balA) {
    return { ok: false, errorCode: "INSUFFICIENT_BALANCE", error: `Insufficient ${pool.assetA.code} balance. Available: ${formatAmount(balA)}.` };
  }
  if (b > balB) {
    return { ok: false, errorCode: "INSUFFICIENT_BALANCE", error: `Insufficient ${pool.assetB.code} balance. Available: ${formatAmount(balB)}.` };
  }
  if (pool.assetA.issuer === undefined && pool.assetA.code !== "XLM") {
    return { ok: false, errorCode: "TRUSTLINE_MISSING", error: `Missing trustline for ${pool.assetA.code}. Add a trustline before depositing.` };
  }
  if (pool.assetB.issuer === undefined && pool.assetB.code !== "XLM") {
    return { ok: false, errorCode: "TRUSTLINE_MISSING", error: `Missing trustline for ${pool.assetB.code}. Add a trustline before depositing.` };
  }
  return { ok: true, preview: computeAddPreview(pool, amountA, amountB) };
}

async function simulateRemove(pool: Pool, shares: string): Promise<SimulationResult> {
  if (!pool.verified || !REGISTRY_VERIFIED) {
    return { ok: false, errorCode: "UNVERIFIED_CONTRACT", error: "This pool contract is not registry-verified and cannot be called." };
  }
  const s = safeNumber(shares);
  if (s <= 0) {
    return { ok: false, errorCode: "SIMULATION_FAILED", error: "Enter a positive share amount to remove." };
  }
  if (s > safeNumber(pool.totalShares)) {
    return { ok: false, errorCode: "INSUFFICIENT_BALANCE", error: "Requested shares exceed pool total shares." };
  }
  return { ok: true, preview: computeRemovePreview(pool, shares) };
}

export default function LiquidityPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loadingPools, setLoadingPools] = useState(true);
  const [poolsError, setPoolsError] = useState<string | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [shares, setShares] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [simError, setSimError] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState<TxStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadPools = useCallback(async () => {
    setLoadingPools(true);
    setPoolsError(null);
    try {
      const res = await fetch("/api/liquidity/pools", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load pools (${res.status})`);
      const data = (await res.json()) as { pools?: Pool[] };
      const verified = (data.pools ?? []).filter((p) => p.verified);
      setPools(verified);
      if (verified.length > 0 && !selectedPoolId) {
        setSelectedPoolId(verified[0].id);
      }
    } catch (err) {
      setPoolsError(err instanceof Error ? err.message : "Unable to load pools.");
    } finally {
      setLoadingPools(false);
    }
  }, [selectedPoolId]);

  useEffect(() => {
    void loadPools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPool = useMemo(
    () => pools.find((p) => p.id === selectedPoolId) ?? null,
    [pools, selectedPoolId],
  );

  const resetPreview = useCallback(() => {
    setPreview(null);
    setSimError(null);
    setStatus("idle");
    setStatusMessage(null);
  }, []);

  const handleSimulate = useCallback(async () => {
    if (!selectedPool) return;
    setStatus("simulating");
    setStatusMessage("Simulating transaction against Testnet…");
    setPreview(null);
    setSimError(null);
    try {
      const result =
        mode === "add"
          ? await simulateAdd(selectedPool, amountA, amountB)
          : await simulateRemove(selectedPool, shares);
      if (!result.ok) {
        setSimError(result);
        setStatus("failed");
        setStatusMessage(result.error ?? "Simulation failed.");
        return;
      }
      setPreview(result.preview ?? null);
      setStatus("idle");
      setStatusMessage("Simulation succeeded. Review the preview before signing.");
    } catch (err) {
      setSimError({ ok: false, errorCode: "UNKNOWN", error: err instanceof Error ? err.message : "Simulation failed." });
      setStatus("failed");
      setStatusMessage("Simulation failed.");
    }
  }, [selectedPool, mode, amountA, amountB, shares]);

  const handleSign = useCallback(async () => {
    if (!selectedPool || !preview) return;
    setStatus("signing");
    setStatusMessage("Awaiting signature…");
    try {
      const res = await fetch("/api/liquidity/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId: selectedPool.id,
          contractId: selectedPool.contractId,
          mode,
          amountA,
          amountB,
          shares,
          minOutputs: preview.minOutputs,
        }),
      });
      setStatus("submitting");
      setStatusMessage("Submitting transaction…");
      const data = (await res.json()) as { status?: string; hash?: string; error?: string };
      if (!res.ok || data.status !== "success") {
        setStatus("failed");
        setStatusMessage(data.error ?? "Transaction failed. No funds were moved.");
        return;
      }
      setStatus("success");
      setStatusMessage(`Transaction confirmed${data.hash ? ` (${data.hash.slice(0, 10)}…)` : ""}.`);
      setAmountA("");
      setAmountB("");
      setShares("");
      setPreview(null);
      void loadPools();
    } catch (err) {
      setStatus("failed");
      setStatusMessage(err instanceof Error ? err.message : "Transaction failed.");
    }
  }, [selectedPool, preview, mode, amountA, amountB, shares, loadPools]);

  const busy = status === "simulating" || status === "signing" || status === "submitting";

  return (
    <>
      <div className="page-title">
        <h1>Liquidity</h1>
        <p>Add or remove liquidity in registry-verified Testnet pools. Every action is simulated before signing.</p>
      </div>

      <div className="liquidity-grid">
        <Card className="panel liquidity-form">
          <div className="tab-row" aria-label="Liquidity actions">
            <button
              type="button"
              className={mode === "add" ? "active" : ""}
              onClick={() => {
                setMode("add");
                resetPreview();
              }}
              disabled={busy}
            >
              <Plus /> Add liquidity
            </button>
            <button
              type="button"
              className={mode === "remove" ? "active" : ""}
              onClick={() => {
                setMode("remove");
                resetPreview();
              }}
              disabled={busy}
            >
              <Minus /> Remove liquidity
            </button>
          </div>

          <label>
            Pool
            <select
              className="field-button"
              value={selectedPoolId}
              onChange={(e) => {
                setSelectedPoolId(e.target.value);
                resetPreview();
              }}
              disabled={busy || loadingPools || pools.length === 0}
              aria-label="Select pool"
            >
              {loadingPools && <option value="">Loading pools…</option>}
              {!loadingPools && pools.length === 0 && <option value="">No verified pools available</option>}
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.assetA.code}/{p.assetB.code} — {p.contractId.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>

          {poolsError && (
            <div className="inline-error" role="alert">
              <AlertTriangle /> {poolsError}
              <Button type="button" onClick={() => void loadPools()} disabled={loadingPools}>
                <RefreshCw /> Retry
              </Button>
            </div>
          )}

          {selectedPool && (
            <div className="pool-meta">
              <span>Contract: <code>{selectedPool.contractId}</code></span>
              <span>Fee: {(selectedPool.feeBps / 100).toFixed(2)}%</span>
              <span>
                Reserves: {formatAmount(selectedPool.reserveA)} {selectedPool.assetA.code} /{" "}
                {formatAmount(selectedPool.reserveB)} {selectedPool.assetB.code}
              </span>
              <span>Total shares: {formatAmount(selectedPool.totalShares)}</span>
            </div>
          )}

          {mode === "add" ? (
            <div className="dual-fields">
              <label>
                {selectedPool?.assetA.code ?? "Asset A"}
                <div className="amount-field">
                  <input
                    aria-label="Asset A amount"
                    placeholder="0.00"
                    inputMode="decimal"
                    value={amountA}
                    onChange={(e) => {
                      setAmountA(e.target.value);
                      resetPreview();
                    }}
                    disabled={busy || !selectedPool}
                  />
                  <span>{selectedPool?.assetA.code ?? "—"}</span>
                </div>
              </label>
              <label>
                {selectedPool?.assetB.code ?? "Asset B"}
                <div className="amount-field">
                  <input
                    aria-label="Asset B amount"
                    placeholder="0.00"
                    inputMode="decimal"
                    value={amountB}
                    onChange={(e) => {
                      setAmountB(e.target.value);
                      resetPreview();
                    }}
                    disabled={busy || !selectedPool}
                  />
                  <span>{selectedPool?.assetB.code ?? "—"}</span>
                </div>
              </label>
            </div>
          ) : (
            <label>
              Pool shares to remove
              <div className="amount-field">
                <input
                  aria-label="Shares to remove"
                  placeholder="0.00"
                  inputMode="decimal"
                  value={shares}
                  onChange={(e) => {
                    setShares(e.target.value);
                    resetPreview();
                  }}
                  disabled={busy || !selectedPool}
                />
                <span>shares</span>
              </div>
            </label>
          )}

          <div className="action-row">
            <Button
              type="button"
              onClick={() => void handleSimulate()}
              disabled={busy || !selectedPool}
            >
              {status === "simulating" ? <Loader2 className="spin" /> : <Droplets />} Simulate
            </Button>
            <Button
              type="button"
              onClick={() => void handleSign()}
              disabled={busy || !preview || status === "success"}
            >
              {status === "signing" || status === "submitting" ? <Loader2 className="spin" /> : null} Sign &amp; submit
            </Button>
          </div>

          {statusMessage && (
            <div
              className={`status-line ${status === "failed" ? "error" : status === "success" ? "success" : ""}`}
              role="status"
            >
              {status === "success" ? <CheckCircle2 /> : status === "failed" ? <AlertTriangle /> : null}
              {statusMessage}
            </div>
          )}

          {simError && (
            <div className="inline-error" role="alert">
              <AlertTriangle />
              <div>
                <b>{simError.errorCode === "INSUFFICIENT_BALANCE" ? "Insufficient balance" : simError.errorCode === "TRUSTLINE_MISSING" ? "Trustline required" : simError.errorCode === "UNVERIFIED_CONTRACT" ? "Unverified contract" : "Simulation failed"}</b>
                <p>{simError.error}</p>
                {simError.errorCode === "TRUSTLINE_MISSING" && (
                  <p>Open your wallet and add a trustline for this asset, then retry the simulation.</p>
                )}
                {simError.errorCode === "INSUFFICIENT_BALANCE" && (
                  <p>Reduce the amount or fund your account before retrying.</p>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card className="panel">
          <div className="panel-head">
            <h2>Preview</h2>
            <Droplets />
          </div>
          {!preview ? (
            <div className="empty-state">
              <Info />
              <b>No preview yet</b>
              <p>Run a simulation to see amounts, pool share, fee, contract, and minimum outputs before signing.</p>
            </div>
          ) : (
            <dl className="preview-list">
              <div>
                <dt>Amounts</dt>
                <dd>
                  {preview.amounts.a} {selectedPool?.assetA.code} / {preview.amounts.b} {selectedPool?.assetB.code}
                </dd>
              </div>
              <div>
                <dt>Pool share</dt>
                <dd>{preview.poolShare}{mode === "remove" ? "%" : ""}</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd>{preview.fee}</dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>
                  <code>{preview.contract}</code>
                </dd>
              </div>
              <div>
                <dt>Minimum outputs</dt>
                <dd>
                  {preview.minOutputs.a} {selectedPool?.assetA.code} / {preview.minOutputs.b} {selectedPool?.assetB.code}
                </dd>
              </div>
              {preview.warnings.length > 0 && (
                <div className="warning">
                  <dt>Warnings</dt>
                  <dd>
                    <ul>
                      {preview.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Card>
      </div>
    </>
  );
}