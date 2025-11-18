import React from "react";

const profitability = [
  {
    label: "Daily",
    rows: [
      { title: "Gross Revenue", btc: "0.00245 BTC", usd: "$ 158.32" },
      { title: "Electricity Cost", btc: "0.00021 BTC", usd: "$ 13.48" },
      { title: "Net Profit", btc: "0.00224 BTC", usd: "$ 144.84" },
    ],
  },
  {
    label: "Weekly",
    rows: [
      { title: "Gross Revenue", btc: "0.01715 BTC", usd: "$ 1,108.24" },
      { title: "Electricity Cost", btc: "0.00147 BTC", usd: "$ 94.36" },
      { title: "Net Profit", btc: "0.01568 BTC", usd: "$ 1,013.88" },
    ],
  },
  {
    label: "Monthly",
    rows: [
      { title: "Gross Revenue", btc: "0.07350 BTC", usd: "$ 4,749.60" },
      { title: "Electricity Cost", btc: "0.00630 BTC", usd: "$ 404.40" },
      { title: "Net Profit", btc: "0.06720 BTC", usd: "$ 4,345.20" },
    ],
  },
];

export function MinerQuotation2Page() {
  const issueDate = new Date().toLocaleDateString();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300 mb-2">
            Professional BTC Mining Quotation
          </p>
          <h1 className="text-3xl font-bold">Investment Analysis and Projected Profitability</h1>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-200">General Information</h2>
            <dl className="space-y-2 text-sm sm:text-base">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Equipment Model</dt>
                <dd className="font-medium">Asic Antminer S21 Pro 245TH</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Issue Date</dt>
                <dd className="font-medium">{issueDate}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-200">Technical Specifications</h2>
            <dl className="space-y-2 text-sm sm:text-base">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Unit Power Consumption</dt>
                <dd className="font-medium">3.51 kW</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Hashrate</dt>
                <dd className="font-medium">245 TH/s</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Efficiency</dt>
                <dd className="font-medium text-gray-500">—</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Total Units</dt>
                <dd className="font-medium">20</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Total Power Consumption</dt>
                <dd className="font-medium">70.2 kW/h</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Electricity Cost</dt>
                <dd className="font-medium">0.008 USD/kWh</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-amber-200">Profitability Projection</h2>
            <p className="text-sm text-gray-400">Projected earnings with current market conditions</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {profitability.map((bucket) => (
              <aside
                key={bucket.label}
                className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3 shadow"
              >
                <h3 className="text-lg font-semibold text-amber-300">{bucket.label}</h3>
                <dl className="space-y-3 text-sm sm:text-base">
                  {bucket.rows.map((row) => (
                    <div key={row.title} className="border-t border-gray-800 pt-3 first:border-t-0 first:pt-0">
                      <dt className="text-gray-400">{row.title}</dt>
                      <dd className="flex justify-between font-medium">
                        <span>{row.btc}</span>
                        <span className="text-right text-gray-200">{row.usd}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </aside>
            ))}
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-amber-200">Investment Structure</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm sm:text-base">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-2">Item</th>
                  <th className="py-2">Unit Price</th>
                  <th className="py-2">Quantity</th>
                  <th className="py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                <tr>
                  <td className="py-3 font-medium">Mining Equipment</td>
                  <td className="py-3">$ 3,860.00</td>
                  <td className="py-3">20</td>
                  <td className="py-3">$ 77,200.00</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">International Logistics</td>
                  <td className="py-3">$ 359.00</td>
                  <td className="py-3">20</td>
                  <td className="py-3">$ 7,180.00</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Taxes and Customs Duties</td>
                  <td className="py-3">$ 368.70</td>
                  <td className="py-3">20</td>
                  <td className="py-3">$ 7,374.00</td>
                </tr>
                <tr className="font-semibold text-amber-200">
                  <td className="py-3">Total</td>
                  <td className="py-3">$ 4,587.70</td>
                  <td className="py-3">20</td>
                  <td className="py-3">$ 91,754.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <aside className="bg-gray-900 border border-amber-300/40 rounded-xl p-6 shadow-lg space-y-3">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-300">Total Investment Required</p>
          <h3 className="text-3xl font-bold">USD $ 91,754</h3>
          <p className="text-lg text-gray-200">Estimated Payback Period: 22 months</p>
          <p className="text-lg text-gray-200">Projected Annual ROI: 53.76 %</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            * Calculations are based on current market conditions and may vary depending on mining
            difficulty, Bitcoin price, and operating costs.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default MinerQuotation2Page;
