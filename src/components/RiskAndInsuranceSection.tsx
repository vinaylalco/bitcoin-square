import React from "react";

export function RiskAndInsuranceSection() {
  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6 shadow-[var(--shadow-soft)] space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-amber-200">Key Risks of Bitcoin Mining</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Bitcoin Price Risk</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>BTC may fall or underperform growth scenarios, stretching ROI timelines or preventing payback.</li>
              <li>Revenue is denominated in BTC while costs are often in USD, creating mismatch and volatility.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Network Difficulty &amp; Halving Risk</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Rising difficulty can reduce BTC earned per TH/s faster than price grows.</li>
              <li>Halvings cut block rewards; past behavior is informative but not a guarantee of future prices.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Electricity Cost &amp; Power Supply Risk</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Tariffs or fuel costs can change; curtailment and grid instability reduce uptime and raise costs.</li>
              <li>Contract structures (fixed vs. variable) materially impact breakeven thresholds.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Hardware Risk</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>ASIC failures, repair lead times, and shipping delays reduce uptime and may require capex.</li>
              <li>Newer, more efficient models can make existing fleets less competitive.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Operational &amp; Jurisdictional Risk</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Regulatory changes, taxes, or import/export restrictions can impact hosting, cash flows, or equipment movement.</li>
              <li>Hosting contracts carry counterparty and uptime risk; terms may be difficult to renegotiate.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Counterparty / Custody Risk (for mined BTC)</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Exchange hacks or custodial failures can lead to loss of funds if not using strong security.</li>
              <li>Poor operational security (single-key wallets, hot storage) increases theft or loss risk.</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-amber-200">Insurance &amp; Risk Mitigation Ideas</h2>
        <p className="text-sm text-[var(--fg-muted)]">Options to investigate; not recommendations or endorsements.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Hardware insurance (where available)</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Policies that may cover fire, theft, and certain forms of physical damage to miners.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Hosting facility insurance / SLAs</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Confirm hosting partners carry appropriate coverage and review SLA terms on uptime and power.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Business interruption coverage</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Consider policies that may compensate for lost revenue from specific covered events.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Location diversification</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Deploy hardware across multiple sites or jurisdictions to reduce localized power or regulatory risk.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Financial hedging</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Derivatives or structured products can hedge BTC price downside or lock in power costs at a high level.</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
            <h3 className="text-lg font-semibold text-[var(--fg-default)]">Security &amp; custody practices</h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--fg-default)]">
              <li>Use cold storage, multi-signature wallets, and limit exchange balances to reduce theft or counterparty risk.</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-xs text-[var(--fg-muted)]">
          This is a high-level overview of common risks and possible mitigation strategies. It is not legal, tax, or insurance advice; you should consult qualified professionals in your jurisdiction.
        </p>
      </div>
    </section>
  );
}

export default RiskAndInsuranceSection;
