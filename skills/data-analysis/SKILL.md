---
name: data-analysis
description: "End-to-end data analysis workflow covering data collection, cleaning, exploratory analysis, statistical testing, and visualization. Supports hypothesis testing, regression analysis, clustering, and time series analysis with production-quality outputs."
tags: [data-analysis, statistics, machine-learning, analytics, science]
version: "1.0.0"
license: MIT
metadata:
  author: Klawhub
  category: data-science
  difficulty: advanced
  tools: [xlsx, charts, pdf, docx, web-search, code-execute]
---

# Data Analysis — End-to-End Analytical Workflow

## Purpose
Provide a structured, rigorous approach to data analysis — from raw data to actionable insights. Covers the full pipeline: collection, cleaning, exploration, statistical analysis, modeling, and visualization.

## When to Activate
- User provides data and asks for analysis, insights, or patterns
- Statistical analysis, hypothesis testing, or correlation analysis needed
- Exploratory data analysis (EDA) on a dataset
- User says "analyze this data," "find patterns," "statistics," "correlation"
- Regression analysis, clustering, or classification tasks
- Time series analysis or forecasting
- Data cleaning and preprocessing needed

## Analysis Workflow

### Phase 1: Data Understanding

Before any analysis:

1. **Identify the question** — What decision or insight does the analysis need to support?
2. **Catalog the data** — Schema, types, size, source, freshness, known limitations
3. **Define the target variable** — What are we predicting or explaining?
4. **Establish baselines** — What would "no effect" or "random" look like?

### Phase 2: Data Cleaning & Preparation

Systematic cleaning pipeline:

**Missing Data Assessment:**
- Calculate missing percentage per column
- Determine missingness mechanism: MCAR, MAR, or MNAR
- Strategy per column:
  - < 5% missing: Impute (mean/median/mode or forward-fill for time series)
  - 5-20% missing: Impute with model-based methods or flag as separate category
  - > 20% missing: Consider dropping the column (document why)

**Data Type Corrections:**
- Numeric columns stored as strings → convert
- Date columns → parse to datetime
- Categorical columns with numeric encoding → ensure correct type
- Boolean columns → standardize (0/1, true/false, yes/no)

**Outlier Detection:**
- IQR method for univariate outliers (1.5 * IQR beyond Q1/Q3)
- Z-score method for normally distributed data (|z| > 3)
- Domain knowledge review — some "outliers" are valid extreme values
- Document all outlier handling decisions

**Feature Engineering:**
- Date decomposition (year, month, day_of_week, is_weekend, quarter)
- Binning continuous variables into meaningful categories
- Interaction features (product/ratio of two variables)
- Lag features for time series
- Encoding categorical variables (one-hot, ordinal, target encoding)

### Phase 3: Exploratory Data Analysis (EDA)

**Univariate Analysis (each variable):**
- Distribution shape (histogram, KDE, box plot)
- Central tendency (mean, median, mode)
- Dispersion (std dev, IQR, range)
- Skewness and kurtosis
- For categorical: frequency table, mode, cardinality

**Bivariate Analysis (variable pairs):**
- Numeric-Numeric: Scatter plot + Pearson/Spearman correlation
- Numeric-Categorical: Box plots or violin plots grouped by category
- Categorical-Categorical: Cross-tabulation + chi-square test
- Correlation matrix heatmap for all numeric pairs

**Key Questions EDA Must Answer:**
1. What is the distribution of each variable?
2. Are there strong correlations between features?
3. Are there unexpected patterns or anomalies?
4. Is the target variable imbalanced?
5. Are there obvious segmentation opportunities?

### Phase 4: Statistical Analysis

**Hypothesis Testing Framework:**
```
1. State null hypothesis (H0) and alternative hypothesis (H1)
2. Choose significance level (alpha = 0.05 default)
3. Select appropriate test
4. Calculate test statistic and p-value
5. Interpret: p < alpha → reject H0
6. Report effect size (not just p-value)
```

**Common Tests:**

| Question | Test | Conditions |
|----------|------|-----------|
| Difference in means (2 groups) | Independent t-test | Normal distribution, equal variance |
| Difference in means (2 groups, non-normal) | Mann-Whitney U | Non-normal distribution |
| Difference in means (3+ groups) | ANOVA | Normal distribution, equal variance |
| Association between categorical variables | Chi-square test | Expected count > 5 per cell |
| Correlation between continuous variables | Pearson correlation | Linear relationship, normal |
| Correlation (non-linear or ordinal) | Spearman rank | Monotonic relationship |
| Before/after comparison | Paired t-test | Same subjects, normal distribution |

**Regression Analysis:**
- Linear regression: One continuous outcome, linear relationship
- Multiple regression: Multiple predictors, check multicollinearity (VIF < 5)
- Logistic regression: Binary outcome
- Report: coefficients, R-squared, p-values, residual analysis

### Phase 5: Advanced Analysis (When Needed)

**Clustering:**
- K-Means for numerical data (use elbow method + silhouette score for k)
- DBSCAN for density-based clustering (automatically detects outliers)
- Hierarchical clustering with dendrograms
- Always standardize features before clustering

**Time Series:**
- Trend decomposition (trend, seasonal, residual)
- Moving averages (simple, exponential, weighted)
- Stationarity tests (ADF test)
- Seasonality analysis
- Growth rate calculations (MoM, YoY, CAGR)

### Phase 6: Insight Synthesis & Reporting

**Deliverable Structure:**
1. **Executive Summary** — Key findings in 3-5 bullet points
2. **Methodology** — Data sources, cleaning steps, analysis approach
3. **Key Findings** — Each with supporting statistics and visualizations
4. **Recommendations** — Actionable next steps based on findings
5. **Limitations** — What the data cannot tell us, caveats
6. **Appendix** — Detailed tables, additional charts, code

**Visualization Best Practices:**
- Use `charts` skill for production-quality visualizations
- Choose chart type based on data: bar (categories), line (trends), scatter (relationships), heatmap (correlations), box (distributions)
- Always label axes, include titles, use consistent color scheme
- Add annotations for key data points
- Keep it simple — one main message per chart

## Statistical Reporting Standards

1. **Never report p-values alone** — Always include effect size
2. **Confidence intervals** — Report 95% CI for key estimates
3. **Sample size matters** — Note n for every analysis
4. **Practical significance > statistical significance** — A statistically significant result may not be practically meaningful
5. **Multiple testing correction** — Apply Bonferroni or BH correction when running many tests
6. **Data provenance** — Always state where data came from and any transformations applied
