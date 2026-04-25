# Data Quality Checklist

A systematic framework for assessing, profiling, scoring, and improving data quality.

---

## 1. Completeness Checks

### Missing Value Analysis

Quantify missingness at column and row level before any imputation.

```python
import pandas as pd
import numpy as np

def missing_value_report(df):
    """Generate a comprehensive missing value summary."""
    total = len(df)
    missing = df.isnull().sum()
    pct = (missing / total * 100).round(2)
    report = pd.DataFrame({
        'Missing_Count': missing, 'Missing_Pct': pct,
        'Data_Type': df.dtypes, 'Unique_Values': df.nunique()
    }).sort_values('Missing_Pct', ascending=False)
    return report[report['Missing_Count'] > 0]

def row_missingness_profile(df):
    """Profile missingness patterns at the row level."""
    missing_per_row = df.isnull().sum(axis=1)
    total_cols = df.shape[1]
    vc = missing_per_row.value_counts().sort_index()
    return pd.DataFrame({
        'Missing_Count': vc.index, 'Row_Count': vc.values,
        'Pct_Missing': (vc.index / total_cols * 100).round(1)
    })
```

### Missingness Mechanism Tests

| Pattern | Description | Test |
|---|---|---|
| **MCAR** | Missingness unrelated to any data | Little's MCAR test |
| **MAR** | Missingness related to observed data | Compare missing vs non-missing groups |
| **MNAR** | Missingness related to the unobserved value itself | Domain knowledge, sensitivity analysis |

```python
from scipy import stats

def test_mcar_simple(df, target_col):
    """Test if missingness of target_col is independent of numeric columns."""
    missing_indicator = df[target_col].isnull().astype(int)
    results = []
    for col in df.select_dtypes(include='number').columns:
        if col == target_col:
            continue
        stat, p = stats.ttest_ind(
            df.loc[missing_indicator == 0, col].dropna(),
            df.loc[missing_indicator == 1, col].dropna())
        results.append({'Variable': col, 't_stat': round(stat, 3), 'p_value': round(p, 4)})
    return pd.DataFrame(results).sort_values('p_value')
```

---

## 2. Consistency Checks

### Cross-Field Validation

Verify logical relationships between columns using business rules.

```python
def cross_field_validation(df, rules):
    """Validate records against business rules.
    rules: list of (name, condition_function) tuples."""
    failures = {}
    for name, condition in rules:
        count = (~condition(df)).sum()
        failures[name] = {'Fail_Count': count, 'Fail_Pct': f"{count/len(df)*100:.2f}%"}
    return pd.DataFrame(failures).T

# Example rules
rules = [
    ('end_date_after_start', lambda d: pd.to_datetime(d['end_date']) >= pd.to_datetime(d['start_date'])),
    ('age_reasonable', lambda d: (d['age'] >= 0) & (d['age'] <= 120)),
    ('discount_le_price', lambda d: d['discount'] <= d['price']),
]
```

### Format Validation

```python
import re

def validate_formats(df, rules):
    """Validate column formats against regex patterns.
    rules: list of (column, regex_pattern, description)."""
    results = {}
    for col, pattern, desc in rules:
        if col not in df.columns:
            continue
        valid = df[col].dropna().astype(str).str.match(pattern)
        results[col] = {
            'Description': desc,
            'Valid_Pct': f"{valid.sum()/len(valid.dropna())*100:.2f}%",
            'Invalid_Count': int((~valid).sum()),
            'Sample_Invalid': df.loc[valid.index[~valid], col].head(3).tolist()
        }
    return pd.DataFrame(results).T

format_rules = [
    ('email', r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$', 'Email format'),
    ('phone', r'^\+?\d{7,15}$', 'Phone number'),
    ('zip_code', r'^\d{5}(-\d{4})?$', 'US ZIP code'),
    ('date', r'^\d{4}-\d{2}-\d{2}$', 'ISO date YYYY-MM-DD'),
]
```

### Range and Referential Integrity

```python
def range_validation(df, rules):
    """Validate columns fall within expected ranges. rules: (col, min, max)."""
    results = []
    for col, min_v, max_v in rules:
        if col not in df.columns:
            continue
        oor = df[col][(df[col] < min_v) | (df[col] > max_v)]
        results.append({
            'Column': col, 'Expected_Range': f'[{min_v}, {max_v}]',
            'Out_of_Range_Count': len(oor),
            'Min_Actual': df[col].min(), 'Max_Actual': df[col].max()})
    return pd.DataFrame(results)

def check_referential_integrity(df, lookup_df, fk_col, pk_col):
    """Check foreign key values exist in the primary key table."""
    orphan = df[~df[fk_col].isin(lookup_df[pk_col].unique())][fk_col]
    return {'Orphan_Count': len(orphan),
            'Orphan_Pct': f"{len(orphan)/len(df)*100:.2f}%",
            'Sample_Orphans': orphan.unique()[:10].tolist()}
```

---

## 3. Accuracy Checks

### Outlier Detection Methods

```python
def detect_outliers_iqr(series, factor=1.5):
    """IQR-based outlier detection. Returns (mask, lower, upper)."""
    Q1, Q3 = series.quantile(0.25), series.quantile(0.75)
    IQR = Q3 - Q1
    lower, upper = Q1 - factor * IQR, Q3 + factor * IQR
    return (series < lower) | (series > upper), lower, upper

def detect_outliers_zscore(series, threshold=3):
    """Z-score-based outlier detection."""
    return np.abs((series - series.mean()) / series.std()) > threshold

def detect_outliers_isolation_forest(df, columns, contamination=0.05):
    """Multivariate outlier detection using Isolation Forest."""
    from sklearn.ensemble import IsolationForest
    iso = IsolationForest(contamination=contamination, random_state=42)
    return iso.fit_predict(df[columns]) == -1
```

### Cross-Reference Validation

```python
def cross_reference_check(df, ref_values, column):
    """Check column values against known reference set."""
    valid = df[column].isin(ref_values)
    return {
        'Invalid_Count': int((~valid).sum()),
        'Invalid_Pct': f"{(~valid).sum()/len(df)*100:.2f}%",
        'Invalid_Values': df.loc[~valid, column].unique()[:10].tolist()
    }
```

---

## 4. Timeliness Checks

### Data Freshness and Temporal Gaps

```python
from datetime import datetime, timedelta

def check_freshness(df, date_col, max_age_days=1):
    """Check if the most recent data is within acceptable freshness."""
    max_date = pd.to_datetime(df[date_col]).max()
    age = (datetime.now() - max_date).days
    return {'Latest_Date': max_date.strftime('%Y-%m-%d'), 'Age_Days': age,
            'Fresh': age <= max_age_days}

def detect_temporal_gaps(df, date_col, freq='D'):
    """Detect missing time periods in a date-indexed dataset."""
    dates = pd.to_datetime(df[date_col])
    full_range = pd.date_range(start=dates.min(), end=dates.max(), freq=freq)
    missing = full_range.difference(dates)
    return {
        'Expected_Periods': len(full_range), 'Actual_Periods': len(dates.unique()),
        'Missing_Periods': len(missing),
        'Missing_Pct': f"{len(missing)/len(full_range)*100:.2f}%",
        'First_Gap': missing[0].strftime('%Y-%m-%d') if len(missing) > 0 else 'None'}

def assess_latency(df, event_col, recorded_col, unit='hours'):
    """Measure delay between event occurrence and data recording."""
    latency = (pd.to_datetime(df[recorded_col]) - pd.to_datetime(df[event_col]))
    conv = {'hours': lambda x: x.dt.total_seconds()/3600,
            'minutes': lambda x: x.dt.total_seconds()/60}
    vals = conv[unit](latency).dropna()
    return {
        'Mean_Latency': f"{vals.mean():.1f} {unit}",
        'Median_Latency': f"{vals.median():.1f} {unit}",
        'P95_Latency': f"{vals.quantile(0.95):.1f} {unit}",
        'Negative_Count': int((vals < 0).sum())}
```

---

## 5. Uniqueness Checks

### Exact and Fuzzy Duplicate Detection

```python
def duplicate_analysis(df, subset=None):
    """Comprehensive duplicate analysis."""
    exact = df.duplicated(subset=subset, keep='first')
    involved = df.duplicated(subset=subset, keep=False)
    return {
        'Total_Rows': len(df), 'Exact_Duplicate_Count': int(exact.sum()),
        'Exact_Duplicate_Pct': f"{exact.sum()/len(df)*100:.2f}%",
        'Rows_Involved_In_Dups': int(involved.sum()),
        'Duplicate_Samples': df[involved].head(5).to_dict('records')
    }

from rapidfuzz import fuzz, process

def find_fuzzy_duplicates(series, threshold=90):
    """Find approximate duplicates using string similarity."""
    seen, fuzzy_dups = {}, []
    for idx, val in enumerate(series.dropna().astype(str)):
        match = process.extractOne(val, seen.keys(), scorer=fuzz.ratio, score_cutoff=threshold)
        if match:
            fuzzy_dups.append({'Index': idx, 'Value': val, 'Match': match[0], 'Score': match[1]})
        else:
            seen[val] = True
    return pd.DataFrame(fuzzy_dups)
```

---

## 6. Data Profiling Template

Automated column-level analysis for every new dataset.

```python
def profile_dataset(df, sample_size=10000):
    """Automated column-level profiling."""
    sample = df.sample(min(sample_size, len(df)), random_state=42) if len(df) > sample_size else df
    profiles = []
    for col in sample.columns:
        s = sample[col]
        dtype = str(s.dtype)
        p = {'Column': col, 'Dtype': dtype, 'Non_Null': int(s.count()),
             'Null_Pct': f"{s.isnull().sum()/len(sample)*100:.1f}%", 'Unique': int(s.nunique())}
        if dtype in ['int64', 'float64']:
            p.update({'Mean': f"{s.mean():.2f}", 'Std': f"{s.std():.2f}",
                       'Min': f"{s.min():.2f}", 'Median': f"{s.median():.2f}",
                       'Max': f"{s.max():.2f}", 'Skewness': f"{s.skew():.2f}"})
        elif dtype == 'object':
            p.update({'Top_Value': str(s.mode().iloc[0]) if len(s.mode()) else '',
                       'Top_Pct': f"{s.value_counts(normalize=True).iloc[0]*100:.1f}%" if len(s.value_counts()) else '0%',
                       'Min_Length': int(s.dropna().str.len().min()) if s.dropna().str.len().any() else 0,
                       'Max_Length': int(s.dropna().str.len().max()) if s.dropna().str.len().any() else 0})
        elif 'datetime' in dtype:
            p.update({'Min_Date': str(s.min()), 'Max_Date': str(s.max()),
                       'Span_Days': int((s.max() - s.min()).days)})
        profiles.append(p)
    return pd.DataFrame(profiles)
```

---

## 7. Data Quality Scorecard

Aggregate quality dimensions into a single actionable score (0-100).

```python
def calculate_quality_score(df, weights=None):
    """Calculate overall data quality score with letter grade."""
    if weights is None:
        weights = {'Completeness': 0.30, 'Consistency': 0.25, 'Uniqueness': 0.20, 'Timeliness': 0.25}
    completeness = (1 - df.isnull().sum().sum() / (df.shape[0] * df.shape[1])) * 100
    uniqueness = (1 - df.duplicated().sum() / len(df)) * 100
    numeric_ratio = df.select_dtypes(include='number').shape[1] / df.shape[1] if df.shape[1] > 0 else 0
    consistency = numeric_ratio * 100
    date_cols = [c for c in df.columns if 'date' in c.lower() or 'time' in c.lower()]
    timeliness = max(0, 100 - (datetime.now() - pd.to_datetime(df[date_cols[0]]).max()).days) if date_cols else 100
    scores = {'Completeness': completeness, 'Consistency': consistency,
              'Uniqueness': uniqueness, 'Timeliness': timeliness}
    overall = sum(scores[k] * weights[k] for k in weights)
    grade = 'A' if overall >= 90 else 'B' if overall >= 75 else 'C' if overall >= 60 else 'D' if overall >= 40 else 'F'
    return {'Overall_Score': round(overall, 1), 'Grade': grade,
            'Dimensions': {k: round(v, 1) for k, v in scores.items()}}
```

| Grade | Score | Action |
|---|---|---|
| **A** | 90-100 | High quality. Proceed with confidence. |
| **B** | 75-89 | Minor issues. Review flagged items. |
| **C** | 60-74 | Moderate issues. Cleaning required. |
| **D** | 40-59 | Significant issues. Investigate sources. |
| **F** | 0-39 | Critical. Do not use without major remediation. |

---

## 8. Cleaning Decision Framework

### Decision Flowchart

```
Issue found
├── Column critical to analysis?
│   ├── No → DROP column
│   └── Yes → What proportion affected?
│       ├── > 50% → Obtain from another source? → Yes: merge | No: FLAG
│       ├── 30-50% → IMPUTE with domain-appropriate method
│       └── < 30% → MCAR/MAR? → IMPUTE | MNAR? → FLAG + sensitivity analysis
├── Outlier?
│   ├── Impossible value → DROP or correct
│   ├── Plausible extreme → FLAG, keep
│   └── Impacting model → TRANSFORM or Winsorize
└── Inconsistency?
    ├── Format issue → TRANSFORM to standard format
    ├── Unit mismatch → TRANSFORM to common unit
    └── Cross-field violation → FLAG for review
```

### DROP

- Missing > 50% in a non-critical column.
- Rows with > 70% missing values.
- Confirmed exact duplicates (keep first/most recent).
- Physically impossible values.

```python
cols_to_drop = [c for c in df.columns if df[c].isnull().sum() / len(df) > 0.5]
df_clean = df.drop(columns=cols_to_drop)
df_clean = df_clean.dropna(thresh=int(df_clean.shape[1] * 0.3))
```

### IMPUTE

- Missing < 30% and MCAR or MAR.
- Numeric: median (robust) or mean (normal distributions).
- Categorical: mode or "Unknown" category.
- Time series: forward fill, interpolation.

```python
df['age'].fillna(df['age'].median(), inplace=True)
df['category'].fillna('Unknown', inplace=True)
# Advanced: multivariate imputation
from sklearn.impute import KNNImputer
imputer = KNNImputer(n_neighbors=5)
df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
```

### FLAG

- Outliers that are plausible but extreme.
- Missing values in a critical field.
- Business rule violations that may be edge cases.
- Records needing manual review.

```python
df['flag_outlier_revenue'] = detect_outliers_iqr(df['revenue'])[0]
df['flag_missing_email'] = df['email'].isnull()
df['flag_date_anomaly'] = pd.to_datetime(df['end_date']) < pd.to_datetime(df['start_date'])
```

### TRANSFORM

- Skewed distributions: log, Box-Cox, Yeo-Johnson.
- Inconsistent units: convert to standard.
- Scaling: z-score or min-max for model input.

```python
from sklearn.preprocessing import PowerTransformer, StandardScaler
pt = PowerTransformer(method='yeo-johnson', standardize=True)
df['revenue_transformed'] = pt.fit_transform(df[['revenue']])
scaler = StandardScaler()
df['age_zscore'] = scaler.fit_transform(df[['age']])
```
