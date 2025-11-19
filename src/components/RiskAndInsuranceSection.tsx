import React from "react";

const riskSections = [
  {
    title: "Bitcoin price risk",
    description:
      "BTC revenue is volatile and denominated in an asset that can fall sharply just as your power bills come due in fiat.",
    practice: [
      "Payback can stretch out months or never arrive if BTC spends long periods below your modeled price curve.",
      "Running costs (power, hosting, interest) stay denominated in USD, so drawdowns hit cash flow immediately.",
    ],
    stressTest: "Try dropping the BTC price curve by 30-50% in the Scenario Explorer and compare new payback months.",
  },
  {
    title: "Difficulty growth & halvings",
    description:
      "Network difficulty tends to rise with new hashrate, and halvings instantly cut the block subsidy every ~4 years.",
    practice: [
      "Sudden difficulty jumps reduce BTC earned per TH/s before you have time to upgrade hardware.",
      "Halving events can cut revenue in half overnight if price does not re-rate quickly enough.",
    ],
    stressTest: "Reduce the BTC mined per month or increase operating costs to mimic a post-halving environment.",
  },
  {
    title: "Electricity cost & power supply",
    description:
      "Power contracts, grid curtailment, and seasonal demand swings can change your effective $/kWh at short notice.",
    practice: [
      "Unexpected tariff hikes or curtailment clauses can double operating costs or force downtime.",
      "Demand charges and variable fuel costs can erode margins even if BTC price stays flat.",
    ],
    stressTest: "Increase the electricity input in the Scenario Explorer or breakeven heatmap to see new net margins.",
  },
  {
    title: "Hardware procurement & reliability",
    description:
      "ASICs are capital-intensive, face long lead times, and can fail without warning when run 24/7 in harsh conditions.",
    practice: [
      "Repair queues or shipping delays can sideline rigs for weeks, slashing daily revenue.",
      "Next-gen models often arrive before ROI is realized, making older fleets uncompetitive.",
    ],
    stressTest: "In Scenario Explorer, lower hashrate or uptime percentages to simulate part of the fleet going offline.",
  },
  {
    title: "Operational, regulatory & tax",
    description:
      "Hosting contracts, permitting, and local policy can change faster than expected, impacting uptime or cash flows.",
    practice: [
      "Site-specific outages, strikes, or unfavorable regulation can halt mining even if your hardware is ready.",
      "Import/export controls or taxes can trap capital when trying to move or sell equipment.",
    ],
    stressTest: "Model downtime or higher operating costs, and review the payback summary for new best/worst cases.",
  },
  {
    title: "Counterparty & custody of mined BTC",
    description:
      "Mining revenue often accumulates on pools, exchanges, or hosted wallets that carry theft and solvency risk.",
    practice: [
      "Large balances sitting on a single exchange or hot wallet increase the blast radius of a compromise.",
      "Operational errors (lost keys, poor multi-sig discipline) can permanently destroy mined BTC.",
    ],
    stressTest: "Compare holding all mined BTC vs. selling monthly using the Mining vs. HODL table to gauge exposure.",
  },
];

const mitigationSections = [
  {
    title: "Physical & operational coverage",
    items: [
      {
        name: "Hardware insurance (property & inland marine)",
        description:
          "Ask about coverage for fire, theft, transit damage, and whether hashboards are covered while installed off-site.",
        pros: ["Helps recover capex after a covered event.", "Some policies include expedited repair or replacement riders."],
        limitations: [
          "Availability varies by jurisdiction and underwriters often require strict facility controls.",
          "Premiums and deductibles can rival several months of profit.",
        ],
      },
      {
        name: "Hosting facility insurance & SLAs",
        description:
          "Request proof of property/casualty coverage, understand business interruption clauses, and document uptime guarantees.",
        pros: ["Transfers part of the facility-level risk to a party with balance sheet capacity."],
        limitations: [
          "Claims may require lengthy investigations and only cover specific perils.",
          "SLAs often cap compensation and rarely repay lost BTC revenue exactly.",
        ],
      },
      {
        name: "Business interruption / contingent coverage",
        description:
          "Ask whether lost mining revenue or extra expense from a covered outage could be reimbursed, and what triggers payment.",
        pros: ["Provides cash to cover fixed costs while equipment is offline."],
        limitations: [
          "Usually tied to narrowly defined perils and capped payouts.",
          "Documentation burden is high; small operators may not qualify.",
        ],
      },
    ],
  },
  {
    title: "Financial & market risk tools",
    items: [
      {
        name: "BTC price hedging",
        description:
          "Discuss collars, puts, or structured products that lock in a minimum USD value for future production.",
        pros: ["Stabilizes cash flow and debt service even during price drawdowns."],
        limitations: [
          "Premiums or margin requirements add cost.",
          "Upside is capped if BTC rallies above the hedge strike.",
        ],
      },
      {
        name: "Forward power contracts / fixed-price energy",
        description:
          "Ask utilities or independent power providers about fixed-rate blocks, take-or-pay structures, or demand-response credits.",
        pros: ["Locks in a predictable operating cost for modeling payback.", "May unlock cheaper financing if lenders see stable power costs."],
        limitations: [
          "You may owe for power even if curtailment or downtime hits.",
          "Long-term fixed contracts can be above spot when prices fall.",
        ],
      },
    ],
  },
  {
    title: "Security & custody practices",
    items: [
      {
        name: "Cold storage & multi-signature",
        description:
          "Ask custodians or wallet providers about hardware security modules, segregation of client assets, and multi-sig policies.",
        pros: ["Reduces single-point-of-failure risk compared to keeping balances on exchanges.", "Improves auditability for lenders or partners."],
        limitations: [
          "Operational overhead (signing ceremonies, key rotation) adds friction.",
          "Losing quorum or hardware devices can delay payouts if not planned carefully.",
        ],
      },
      {
        name: "Counterparty diversification",
        description:
          "Keep mining pool payouts, treasury storage, and exchange accounts split across reputable providers with clear solvency reports.",
        pros: ["Limits blast radius if one venue freezes withdrawals or is hacked."],
        limitations: ["More accounts mean more operational processes and KYC reviews to maintain."],
      },
    ],
  },
];

export function RiskAndInsuranceSection() {
  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6 shadow-[var(--shadow-soft)] space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-amber-200">Key Risks of Bitcoin Mining</h2>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Use these prompts to pressure-test the scenarios above. Each card outlines how a risk shows up in the real world and
          how to simulate it with the ROI explorer, tables, or heatmaps.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {riskSections.map((section) => (
            <div
              key={section.title}
              className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3"
            >
              <div>
                <h3 className="text-lg font-semibold text-[var(--fg-default)]">{section.title}</h3>
                <p className="text-sm text-[var(--fg-muted)]">{section.description}</p>
              </div>
              <div className="space-y-2 text-sm text-[var(--fg-default)]">
                <p className="font-semibold text-[var(--fg-default)]">What it means in practice</p>
                <ul className="list-disc pl-5 space-y-1">
                  {section.practice.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="text-sm text-[var(--fg-default)]">
                <p className="font-semibold">How to stress-test it in this tool</p>
                <p className="text-[var(--fg-muted)]">{section.stressTest}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-amber-200">Insurance &amp; Risk Mitigation Ideas</h2>
        <p className="text-sm text-[var(--fg-muted)]">Options to investigate; not recommendations or endorsements.</p>
        <div className="mt-4 space-y-4">
          {mitigationSections.map((group) => (
            <div key={group.title} className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
              <h3 className="text-lg font-semibold text-[var(--fg-default)]">{group.title}</h3>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <div key={item.name} className="rounded-md border border-[var(--border-subtle)] p-3 space-y-2 bg-[var(--bg-card)]">
                    <div>
                      <p className="text-base font-semibold text-[var(--fg-default)]">{item.name}</p>
                      <p className="text-sm text-[var(--fg-muted)]">{item.description}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-semibold text-emerald-300">Pros</p>
                        <ul className="list-disc pl-5 text-sm text-[var(--fg-default)] space-y-1">
                          {item.pros.map((pro) => (
                            <li key={pro}>{pro}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-rose-300">Limitations</p>
                        <ul className="list-disc pl-5 text-sm text-[var(--fg-default)] space-y-1">
                          {item.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-[var(--fg-muted)]">
          How to use this section: combine the stress tests, tables, and charts above with these risk ideas to outline your own
          best-, base-, and worst-case playbooks. This content is for information only and not legal, tax, financial, or
          insurance advice. Work with qualified professionals before making decisions.
        </p>
      </div>
    </section>
  );
}

export default RiskAndInsuranceSection;
