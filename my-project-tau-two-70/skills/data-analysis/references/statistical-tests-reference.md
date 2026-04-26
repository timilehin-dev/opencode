# Statistical Tests Reference Guide

A comprehensive guide to choosing, implementing, and interpreting statistical tests
for data analysis workflows.

---

## Quick Decision Tree

```
What is your goal?
├── Compare groups
│   ├── 2 groups, independent → Independent t-test OR Mann-Whitney U
│   ├── 2 groups, paired → Paired t-test OR Wilcoxon signed-rank
│   ├── 3+ groups, independent → One-way ANOVA OR Kruskal-Wallis
│   └── Categorical → Chi-square test OR Fisher's exact
├── Assess relationship
│   ├── 2 continuous → Pearson r OR Spearman rho
│   ├── Continuous outcome + predictors → Linear regression
│   └── Binary outcome + predictors → Logistic regression
├── Check assumptions
│   ├── Normality → Shapiro-Wilk OR Kolmogorov-Smirnov
│   ├── Equal variance → Levene's test
│   ├── Stationarity (time series) → ADF test
│   └── Autocorrelation → Durbin-Watson
└── Categorical association
    ├── Large sample (expected freq >= 5) → Chi-square
    └── Small sample (expected freq < 5) → Fisher's exact
```

**Parametric vs Non-parametric**: Use parametric when data are approximately normal
(Shapiro-Wilk p > 0.05) and variances are equal (Levene's p > 0.05). Otherwise, use
the non-parametric alternative.

---

## Parametric Comparison Tests

### Independent t-test

- **Purpose**: Compare means of two independent groups.
- **Assumptions**: Normality, homogeneity of variance, independence.
- **Test statistic**: t-value.
- **When to use**: Two unrelated groups, continuous outcome (e.g., control vs treatment).
- **When NOT to use**: Paired data, more than two groups, non-normal data with small n.

```python
from scipy import stats
t_stat, p = stats.ttest_ind(group_a, group_b, equal_var=True)
# Welch's t-test for unequal variances:
t_stat, p = stats.ttest_ind(group_a, group_b, equal_var=False)
```

### Paired t-test

- **Purpose**: Compare means of two related/matched samples.
- **Assumptions**: Normality of differences, paired observations.
- **Test statistic**: t-value.
- **When to use**: Before/after measurements, matched pairs.
- **When NOT to use**: Independent groups, more than two time points, ordinal data.

```python
from scipy import stats
t_stat, p = stats.ttest_rel(before, after)
# Pre-check: normality of differences
_, norm_p = stats.shapiro([b - a for b, a in zip(before, after)])
```

### One-way ANOVA

- **Purpose**: Compare means across three or more independent groups.
- **Assumptions**: Normality, homogeneity of variance, independence.
- **Test statistic**: F-statistic.
- **When to use**: 3+ groups, continuous outcome, between-subjects design.
- **When NOT to use**: Within-subjects (use RM-ANOVA), non-normal data.

```python
from scipy import stats
from statsmodels.stats.multicomp import pairwise_tukeyhsd
import pandas as pd

f_stat, p = stats.f_oneway(group_a, group_b, group_c)
# Post-hoc Tukey HSD
df = pd.DataFrame({'value': values, 'group': groups})
tukey = pairwise_tukeyhsd(df['value'], df['group'], alpha=0.05)
print(tukey.summary())
```

---

## Non-parametric Comparison Tests

### Mann-Whitney U

- **Purpose**: Non-parametric comparison of two independent groups.
- **Assumptions**: Independence, similar distribution shapes.
- **Test statistic**: U statistic.
- **When to use**: Non-normal data, small samples, ordinal outcomes.
- **When NOT to use**: Paired data, normal data with large samples.

```python
from scipy import stats
u_stat, p = stats.mannwhitneyu(group_a, group_b, alternative='two-sided')
```

### Wilcoxon Signed-Rank

- **Purpose**: Non-parametric comparison of two paired samples.
- **Assumptions**: Paired observations, symmetric distribution of differences.
- **Test statistic**: W statistic.
- **When to use**: Non-normal paired differences, ordinal paired data.
- **When NOT to use**: Independent groups, asymmetric differences.

```python
from scipy import stats
w_stat, p = stats.wilcoxon(before, after, alternative='two-sided')
```

### Kruskal-Wallis

- **Purpose**: Non-parametric comparison of three or more independent groups.
- **Assumptions**: Independence, ordinal or continuous data.
- **Test statistic**: H statistic (chi-square approximation).
- **When to use**: Non-normal data with 3+ groups.
- **When NOT to use**: Paired data, normal data (ANOVA preferred).

```python
from scipy import stats
h_stat, p = stats.kruskal(group_a, group_b, group_c)
# Post-hoc: Dunn's test (pip install scikit-posthocs)
import scikit_posthocs as sp
df = pd.DataFrame({'value': values, 'group': groups})
posthoc = sp.posthoc_dunn(df, val_col='value', group_col='group', p_adjust='bonferroni')
```

---

## Categorical Tests

### Chi-Square Test of Independence

- **Purpose**: Test association between two categorical variables.
- **Assumptions**: Expected frequencies >= 5 in 80% of cells, independence.
- **Test statistic**: Chi-square statistic.
- **When to use**: Two categorical variables, contingency tables.
- **When NOT to use**: Expected cell counts < 5 (use Fisher's exact), paired data.

```python
from scipy import stats
chi2, p, dof, expected = stats.chi2_contingency(contingency_table)
```

### Fisher's Exact Test

- **Purpose**: Exact test of association for 2x2 tables (or small tables).
- **Assumptions**: Independent observations.
- **Test statistic**: Exact p-value; also returns odds ratio.
- **When to use**: Small samples, expected cell counts < 5, 2x2 tables.
- **When NOT to use**: Large tables (computationally expensive).

```python
from scipy import stats
odds_ratio, p = stats.fisher_exact(table_2x2, alternative='two-sided')
```

---

## Relationship Tests

### Pearson Correlation

- **Purpose**: Measure linear relationship between two continuous variables.
- **Assumptions**: Linearity, bivariate normality, homoscedasticity, no outliers.
- **Test statistic**: r coefficient (-1 to +1).
- **When to use**: Two continuous variables, linear relationship expected.
- **When NOT to use**: Ordinal data, non-linear relationships, outliers present.

```python
from scipy import stats
r, p = stats.pearsonr(x, y)
```

### Spearman Rank Correlation

- **Purpose**: Measure monotonic relationship between two variables.
- **Assumptions**: Monotonic relationship, ordinal or continuous data.
- **Test statistic**: rho (-1 to +1).
- **When to use**: Ordinal data, non-normal data, non-linear monotonic relationships.
- **When NOT to use**: Non-monotonic relationships.

```python
from scipy import stats
rho, p = stats.spearmanr(x, y)
```

### Linear Regression

- **Purpose**: Model continuous outcome as a function of predictors.
- **Assumptions**: Linearity, normal residuals, homoscedasticity, no multicollinearity.
- **Test statistic**: F-test (model), t-tests (coefficients), R-squared.
- **When to use**: Continuous outcome, predictive modeling, causal inference.
- **When NOT to use**: Binary outcome, categorical outcome, time series without de-trending.

```python
import statsmodels.api as sm
X = sm.add_constant(predictors)
model = sm.OLS(outcome, X).fit()
print(model.summary())
# Check: R-squared, coef p-values, Durbin-Watson, condition number
```

### Logistic Regression

- **Purpose**: Model binary outcome as a function of predictors.
- **Assumptions**: Independence, linearity of log-odds, no extreme multicollinearity.
- **Test statistic**: Wald chi-square (coefs), Likelihood Ratio (model), AUC.
- **When to use**: Binary classification, probability estimation, risk factor analysis.
- **When NOT to use**: Continuous outcome, multi-class unordered categories.

```python
import statsmodels.api as sm
import numpy as np
X = sm.add_constant(predictors)
model = sm.Logit(binary_outcome, X).fit()
print(model.summary())
odds_ratios = np.exp(model.params)
```

---

## Assumption Tests

### Shapiro-Wilk (Normality)

- **Purpose**: Test whether data follow a normal distribution.
- **Assumptions**: Continuous data, sample size 3-5000.
- **Test statistic**: W (close to 1 = normal).
- **When to use**: Pre-check before parametric tests.
- **When NOT to use**: Very large samples (always significant; use Q-Q plot).

```python
from scipy import stats
W, p = stats.shapiro(data)
# p > 0.05: cannot reject normality
```

### Levene's Test (Equal Variance)

- **Purpose**: Test homogeneity of variances across groups.
- **Assumptions**: Independent samples, continuous data.
- **Test statistic**: Levene's statistic.
- **When to use**: Pre-check for t-test/ANOVA equal variance assumption.
- **When NOT to use**: Dependent samples.

```python
from scipy import stats
stat, p = stats.levene(group_a, group_b, group_c, center='median')
# p > 0.05: variances not significantly different
```

### Kolmogorov-Smirnov

- **Purpose**: Compare a sample to a reference distribution or two samples.
- **Assumptions**: Continuous data, independent observations.
- **Test statistic**: D statistic (max CDF difference).
- **When to use**: Goodness-of-fit, comparing two empirical distributions.
- **When NOT to use**: Discrete data, parameters estimated from data (use Lilliefors).

```python
from scipy import stats
D, p = stats.kstest(data, 'norm', args=(np.mean(data), np.std(data, ddof=1)))
D2, p2 = stats.ks_2samp(sample1, sample2)  # Two-sample
```

### ADF Test (Stationarity)

- **Purpose**: Test whether a time series has a unit root (non-stationary).
- **Assumptions**: Large sample, serial correlation.
- **Test statistic**: ADF statistic (more negative = stronger stationarity evidence).
- **When to use**: Pre-check before ARIMA or other time series modeling.
- **When NOT to use**: Non-time-series data, structural breaks present.

```python
from statsmodels.tsa.stattools import adfuller
result = adfuller(time_series, autolag='AIC')
# p < 0.05: reject unit root (stationary)
```

### Durbin-Watson (Autocorrelation)

- **Purpose**: Detect autocorrelation in regression residuals.
- **Assumptions**: Linear regression residuals, ordered data.
- **Test statistic**: DW (range 0-4; ~2 = no autocorrelation).
- **When to use**: Checking independent errors assumption, time series regression.
- **When NOT to use**: Non-ordered data, lagged dependent variable (use Breusch-Godfrey).

```python
from statsmodels.stats.stattools import durbin_watson
dw = durbin_watson(model.resid)
# DW ~ 2.0: no autocorrelation; < 2: positive; > 2: negative
```

---

## Effect Size Measures

| Measure | Use Case | Small | Medium | Large |
|---|---|---|---|---|
| **Cohen's d** | Mean differences | 0.2 | 0.5 | 0.8 |
| **Pearson's r** | Correlation | 0.1 | 0.3 | 0.5 |
| **R-squared** | Regression fit | 0.02 | 0.13 | 0.26 |
| **Cramer's V** | Categorical assoc. | 0.1 | 0.3 | 0.5 |
| **Odds Ratio** | Binary outcomes | depends on context |

```python
import numpy as np
from scipy import stats

# Cohen's d
def cohens_d(g1, g2):
    n1, n2 = len(g1), len(g2)
    pooled = np.sqrt(((n1-1)*np.var(g1,ddof=1)+(n2-1)*np.var(g2,ddof=1))/(n1+n2-2))
    return (np.mean(g1)-np.mean(g2)) / pooled

# Cramer's V
def cramers_v(table):
    chi2 = stats.chi2_contingency(table)[0]
    n = table.sum()
    return np.sqrt(chi2 / (n * (min(table.shape) - 1)))

# Odds Ratio from 2x2 table
or_val = (table[0,0]*table[1,1]) / (table[0,1]*table[1,0])
```

---

## Multiple Testing Correction

When running many tests, false positive risk increases. Apply corrections.

| Method | Controls | Use When | Trade-off |
|---|---|---|---|
| **Bonferroni** | Family-wise error rate | Few tests (< 20), strict control | Very conservative |
| **Holm** | Family-wise error rate | Moderate tests, step-down | Less conservative |
| **Benjamini-Hochberg** | False discovery rate | Many tests, exploratory | Some false positives expected |
| **BY** | FDR under dependence | Dependent test statistics | Most conservative FDR |

```python
from statsmodels.stats.multitest import multipletests

# Bonferroni
rejected, p_adj, _, _ = multipletests(raw_pvalues, alpha=0.05, method='bonferroni')
# Benjamini-Hochberg (FDR)
rejected, p_adj, _, _ = multipletests(raw_pvalues, alpha=0.05, method='fdr_bh')
# Holm step-down
rejected, p_adj, _, _ = multipletests(raw_pvalues, alpha=0.05, method='holm')
```

---

## Reporting Results Template

Always report: test name, statistic with df, exact p-value, effect size with CI,
and a plain-language conclusion.

```
Example: "An independent t-test revealed a statistically significant difference
in reaction times between the treatment (M=342.5, SD=28.3) and control group
(M=361.2, SD=31.7), t(48)=-2.35, p=.023, d=0.62 (medium effect)."
```
