# Market Analysis Framework

A structured guide for conducting comprehensive financial market analysis,
covering fundamental analysis, technical analysis, portfolio management,
market sentiment, and sector analysis.

---

## 1. Fundamental Analysis Framework

### 1.1 Financial Statements Analysis

#### Income Statement
Reveals revenue, expenses, and profitability over a period.

| Component | Description | What to Look For |
|---|---|---|
| Revenue | Total income from core operations | Revenue growth rate (YoY, QoQ) |
| Gross Profit | Revenue minus COGS | Expanding/contracting gross margins |
| Operating Income (EBIT) | Gross profit minus operating expenses | Operating leverage trends |
| Net Income | Bottom-line profit after all expenses | Quality and consistency of earnings |
| EPS | Net income / shares outstanding | Diluted EPS vs. basic EPS comparison |

**Key Formulas:**
```
Gross Margin (%) = (Revenue - COGS) / Revenue x 100
Operating Margin (%) = EBIT / Revenue x 100
Net Margin (%) = Net Income / Revenue x 100
```

**Interpretation:** Gross margin contraction signals pricing pressure or rising costs. Operating margin expansion with stable revenue suggests efficiency gains. Compare margins against sector peers for meaningful benchmarks.

#### Balance Sheet
Snapshot of assets, liabilities, and shareholders' equity.

**Key Formulas:**
```
Working Capital = Current Assets - Current Liabilities
Tangible Book Value = Total Equity - Intangible Assets - Goodwill
```

**Interpretation:** Declining cash alongside rising debt is a warning sign. High intangibles relative to equity increase impairment risk. Compare working capital trends to revenue growth for efficiency assessment.

#### Cash Flow Statement
Broken into operating, investing, and financing activities.

**Key Formulas:**
```
Free Cash Flow (FCF) = Operating Cash Flow - Capital Expenditures
FCF Yield (%) = FCF / Market Cap x 100
Cash Conversion Ratio = Operating Cash Flow / Net Income
```

**Interpretation:** FCF > Net Income suggests high earnings quality. FCF < Net Income for multiple periods may indicate working capital drag or capex burden. Cash conversion ratio > 1.0 is generally healthy; sustained < 0.8 warrants investigation.

---

### 1.2 Ratio Analysis

#### Profitability Ratios

| Ratio | Formula | Healthy Range | Interpretation |
|---|---|---|---|
| ROE | Net Income / Equity | 15-25% | How efficiently equity generates profit |
| ROA | Net Income / Total Assets | 5-10% | Asset utilization efficiency |
| ROIC | NOPAT / Invested Capital | > WACC | Value creation threshold |
| EBITDA Margin | EBITDA / Revenue | Varies by sector | Cash earnings relative to scale |

**DuPont Decomposition of ROE:**
```
ROE = Net Profit Margin x Asset Turnover x Financial Leverage
    = (Net Income / Revenue) x (Revenue / Assets) x (Assets / Equity)
```
Use this breakdown to identify whether ROE is driven by margins, efficiency, or leverage.

#### Liquidity Ratios

| Ratio | Formula | Interpretation |
|---|---|---|
| Current Ratio | Current Assets / Current Liabilities | > 1.5 safe; < 1.0 = potential crisis |
| Quick Ratio | (Current Assets - Inventory) / Current Liabilities | > 1.0 preferred |
| Cash Ratio | Cash & Equivalents / Current Liabilities | Most conservative; > 0.5 comfortable |

Very high current ratios (> 3.0) may indicate idle cash. Deteriorating liquidity over consecutive quarters signals building pressure.

#### Solvency Ratios

| Ratio | Formula | Interpretation |
|---|---|---|
| Debt-to-Equity | Total Debt / Equity | < 1.0 conservative; > 2.0 aggressive |
| Debt-to-EBITDA | Total Debt / EBITDA | < 2.5x healthy; > 4.0x high risk |
| Interest Coverage | EBIT / Interest Expense | > 5x comfortable; < 2.0 distressed |

#### Efficiency Ratios

| Ratio | Formula | Interpretation |
|---|---|---|
| Asset Turnover | Revenue / Total Assets | Higher = more efficient utilization |
| Inventory Turnover | COGS / Avg Inventory | Higher = faster inventory movement |
| DSO | (A/R / Revenue) x 365 | Lower = faster cash collection |
| CCC | DSO + DIO - DPO | Shorter = better working capital mgmt |

---

### 1.3 Valuation Methods

#### Relative Valuation (Market Multiples)

| Metric | Formula | When to Use |
|---|---|---|
| P/E | Price per Share / EPS | Earnings positive and stable |
| Forward P/E | Price / Forward EPS | Forward estimates are reliable |
| PEG Ratio | P/E / EPS Growth Rate (%) | Comparing growth at different P/E levels |
| P/B | Price / Book Value per Share | Asset-heavy industries (banks, REITs) |
| EV/EBITDA | Enterprise Value / EBITDA | Comparing across different capital structures |

**Interpretation:** Compare multiples against sector medians and historical averages. PEG < 1.0 suggests potential undervaluation. EV/EBITDA preferred over P/E when comparing across tax regimes and debt levels.

#### Intrinsic Valuation (DCF)

**Two-Stage DCF Model:**
```
Terminal Value = FCF_n x (1 + g) / (WACC - g)
Enterprise Value = Sum[FCF_t / (1 + WACC)^t] + Terminal Value / (1 + WACC)^n
Equity Value = Enterprise Value - Net Debt + Minority Interests
Share Price = Equity Value / Shares Outstanding
```

**Key Assumptions:**
- Revenue growth: Base on industry forecasts, TAM analysis, and historical trends.
- Terminal growth rate (g): Typically 2-3%, approximating long-term GDP growth.
- WACC: Typically 8-12%; higher for riskier companies.
- Always run sensitivity tables on WACC and terminal growth rate.

#### Comparable Analysis
1. Identify 5-10 peer companies by sector, size, geography, and business model.
2. Collect trading multiples for each peer.
3. Calculate median and percentile ranges (25th, 50th, 75th).
4. Apply peer median multiples to target fundamentals.
5. Adjust for differences in growth, margins, and risk profile.

---

## 2. Technical Analysis Basics

### 2.1 Trend Identification
- **Uptrend**: Higher highs and higher lows. Price above key moving averages.
- **Downtrend**: Lower highs and lower lows. Price below key moving averages.
- **Sideways**: Price oscillates between defined support and resistance.

Draw trendlines connecting a minimum of two swing lows (uptrend) or highs (downtrend). More touchpoints = more significant the trendline.

### 2.2 Support and Resistance

| Concept | Definition | Trading Implication |
|---|---|---|
| Support | Price level where buying emerges | Potential entry or bounce area |
| Resistance | Price level where selling emerges | Potential exit or breakout target |
| Breakout | Decisive close beyond S/R | Continuation signal; confirm with volume |
| Role Reversal | Broken S becomes R, and vice versa | Former S becomes overhead R after breakdown |

### 2.3 Moving Averages

| Type | Description | Key Signals |
|---|---|---|
| 50-day SMA | Short-to-medium trend | Price above = bullish bias |
| 200-day SMA | Long-term trend benchmark | Price below = bearish regime |
| EMA | Weights recent prices more | Faster trend signals |
| Golden Cross | 50-day crosses above 200-day | Bullish signal |
| Death Cross | 50-day crosses below 200-day | Bearish signal |

### 2.4 RSI (Relative Strength Index)
```
RSI = 100 - (100 / (1 + RS))    where RS = Avg Gain / Avg Loss over 14 periods
```
- **> 70**: Overbought (may stay overbought in strong uptrends).
- **< 30**: Oversold (may stay oversold in strong downtrends).
- **Divergence**: Price makes new extreme but RSI does not — potential reversal.

### 2.5 MACD
```
MACD Line = 12-day EMA - 26-day EMA
Signal Line = 9-day EMA of MACD
Histogram = MACD Line - Signal Line
```
- **Bullish crossover**: MACD crosses above signal line.
- **Bearish crossover**: MACD crosses below signal line.
- **Histogram divergence**: Widening = strengthening momentum; narrowing = weakening.

### 2.6 Volume Analysis

| Pattern | Interpretation |
|---|---|
| Price up + Volume up | Strong buying conviction; trend confirmed |
| Price up + Volume down | Weak rally; potential exhaustion |
| Price down + Volume up | Strong selling conviction; trend confirmed |
| Price down + Volume down | Lack of selling interest; stabilization possible |
| Volume spike at breakout | High conviction; likely sustainable |

---

## 3. Portfolio Analysis

### 3.1 Asset Allocation
- **60/40 Portfolio**: 60% equities / 40% bonds — classic balanced approach.
- **Risk Parity**: Allocate based on inverse volatility for equal risk contribution.
- **Mean-Variance (Markowitz)**: Maximize return for a given risk level.
- **Rebalancing**: Calendar-based (quarterly) or threshold-based (>5% drift from target).

### 3.2 Diversification
```
Portfolio Variance = Sum(w_i^2 x sigma_i^2) + Sum(w_i x w_j x sigma_i x sigma_j x r_ij)
```
- Aim for 15-30 uncorrelated positions for meaningful diversification.
- Correlations < 0.3 between assets provide strong diversification benefit.
- Diversify across asset classes, geographies, sectors, and market cap.

### 3.3 Risk-Adjusted Return Metrics

| Metric | Formula | Interpretation |
|---|---|---|
| Sharpe Ratio | (Rp - Rf) / Sigma_p | > 1.0 good; > 2.0 excellent |
| Sortino Ratio | (Rp - Rf) / Sigma_downside | > 1.5 good; penalizes only downside vol |
| Treynor Ratio | (Rp - Rf) / Beta_p | Higher is better; per unit systematic risk |
| Max Drawdown | (Trough - Peak) / Peak x 100 | < -20% = bear market territory |
| Info Ratio | (Rp - Rb) / Tracking Error | > 0.5 indicates active management skill |

---

## 4. Market Sentiment Indicators

### 4.1 VIX (CBOE Volatility Index)
Implied volatility of S&P 500 options over 30 days.
- **< 15**: Low vol; market complacency (contrarian warning).
- **15-25**: Normal range; balanced fear/greed.
- **25-35**: Elevated fear; active hedging.
- **> 35**: Extreme fear; often coincides with market bottoms (contrarian buy).

### 4.2 Put/Call Ratio
```
PCR = Total Put Volume / Total Call Volume
```
- **< 0.7**: Bullish sentiment. **> 1.0**: Bearish (contrarian: may signal bottom).
- Use 10-day MA to smooth daily noise.

### 4.3 Advance/Decline Line
```
A/D Line = Cumulative (Advancing Issues - Declining Issues)
```
- Market makes new high but A/D line does not: breadth weakening (bearish divergence).
- Market makes new low but A/D line does not: breadth improving (bullish divergence).

### 4.4 Additional Sentiment Gauges
- **AAII Bull/Bear Survey**: >55% bullish = contrarian bearish; <25% = contrarian bullish.
- **New Highs vs. New Lows**: Positive = bullish breadth; negative = bearish breadth.
- **% Stocks Above 200-MA**: >50% confirms broad uptrend.
- **Arms Index (TRIN)**: < 1.0 bullish; > 1.0 bearish.
- **Insider Activity**: Aggressive buying = strong bullish signal; heavy selling = caution.

---

## 5. Sector Analysis

### 5.1 Sector Rotation Theory

| Cycle Phase | Leading Sectors | Lagging Sectors |
|---|---|---|
| Early Recovery | Financials, Discretionary, Real Estate | Utilities, Staples |
| Mid Expansion | Technology, Industrials, Materials | Financials |
| Late Cycle | Energy, Healthcare, Staples | Technology, Discretionary |
| Recession | Utilities, Healthcare, Staples | Financials, Discretionary, Industrials |

**Application:** Monitor yield curve (2s10s inversion precedes recession by 12-18 months). Track PMI/ISM for cycle phase. Use relative strength charts (sector vs. S&P 500) for rotation signals.

### 5.2 Sector-Specific KPIs

| Sector | Key KPIs | Why They Matter |
|---|---|---|
| Technology | Revenue growth, R&D/Sales %, ARR/NRR, gross margin | Growth trajectory and stickiness |
| Financials | NIM, Loan-to-Deposit, NPL ratio, CET1 capital ratio | Credit quality and capital adequacy |
| Healthcare | Pipeline success rate, FDA milestones, patent cliff dates | Innovation pipeline and moat |
| Consumer Staples | Organic growth, market share, pricing power | Defensive stability |
| Energy | Production volumes, reserve replacement, finding costs | Resource base economics |
| Industrials | Backlog growth, order-to-bill ratio, margin expansion | Demand visibility |
| Real Estate | Occupancy rate, same-store NOI growth, cap rate | Asset quality and income stability |
| Utilities | Rate base growth, regulatory ROE, renewable mix | Regulatory environment and predictability |

---

## Quick Reference: Analysis Workflow

1. **Big picture**: Assess macro environment, economic cycle phase, market sentiment.
2. **Screen**: Use financial ratios, growth metrics, and technical indicators to narrow candidates.
3. **Deep-dive fundamentals**: Financial statements, DCF, and comparable analysis.
4. **Validate with technicals**: Trend, support/resistance, volume, momentum indicators.
5. **Portfolio fit**: Diversification contribution, risk-adjusted return impact, position sizing.
6. **Monitor**: Price targets, stop-loss levels, catalyst review on a regular schedule.
