# Visualization Guide

A comprehensive reference for chart selection, design principles, and color theory
in data visualization.

---

## Chart Type Decision Matrix

| Goal | Chart Type | Best For |
|---|---|---|
| **Comparison** | Grouped bar, Line (multi-series), Radar | Comparing values across categories or over time |
| **Composition** | Stacked bar, Pie/Donut, Treemap, Waterfall | Showing parts of a whole |
| **Distribution** | Histogram, Box plot, Violin, Density plot | Spread and shape of data |
| **Relationship** | Scatter, Bubble, Heatmap | Correlation and patterns between variables |
| **Flow** | Sankey, Funnel, Parallel coordinates | Movement, conversion, multi-dimensional paths |
| **Geospatial** | Choropleth, Bubble map | Spatial patterns and regional comparison |
| **Time series** | Line, Area, Candlestick, Sparkline | Trends over continuous time |
| **Ranking** | Horizontal bar, Slopegraph, Lollipop | Ordering items by value |

---

## Detailed Chart Type Guidance

### Bar Charts

**Grouped Bar**: Compare multiple sub-groups side by side.
```python
import matplotlib.pyplot as plt
import numpy as np
categories = ['A', 'B', 'C']
x = np.arange(len(categories))
width = 0.35
plt.bar(x - width/2, values1, width, label='Group 1')
plt.bar(x + width/2, values2, width, label='Group 2')
plt.xticks(x, categories)
plt.legend()
plt.savefig('grouped_bar.png', bbox_inches='tight')
```

**Stacked Bar**: Show composition within each category.
- Use when parts sum to a meaningful total.
- Avoid when comparing intermediate segments (hard to align).
- Limit to 5-7 segments for readability.

**Diverging Bar**: Show positive/negative values from a center axis.
- Use for survey scales (strongly disagree to strongly agree), profit/loss, change from baseline.
- Center axis must be clearly labeled.

**Rules**: Always start y-axis at 0 for bars. Sort bars by value unless categorical order matters.
Avoid 3D bars (they distort perception).

### Line Charts

**Multi-series Line**: Compare trends across 2-7 series.
- Differentiate by color AND line style (solid, dashed, dotted).
- Limit to 5-7 lines; beyond that, use small multiples or highlight one series.

**Area Chart**: Emphasize cumulative volume over time.
- Semi-transparent fills when series overlap.
- Only stack areas if they share the same scale and sum is meaningful.

**Sparkline**: Minimal inline trend without axes or labels.
- Embed in tables or dashboards for at-a-glance trends.
- Show start/end values and min/max markers.

### Scatter Plots

**Basic Scatter**: Show relationship between two continuous variables.
```python
plt.scatter(x, y, alpha=0.6, s=30, c='#2196F3', edgecolors='white', linewidth=0.5)
plt.xlabel('Variable X')
plt.ylabel('Variable Y')
plt.savefig('scatter.png', bbox_inches='tight')
```

**Bubble Chart**: Add a third dimension via point size.
- Scale bubble area (not radius) to the third variable.
- Include a size legend.
- Max 20-30 bubbles; too many becomes unreadable.

### Histogram

- Shows frequency distribution of a continuous variable.
- Bin width matters: too few hides structure, too many creates noise.
- Use Freedman-Diaconis or Sturges' rule for automatic bin selection.

```python
import matplotlib.pyplot as plt
plt.hist(data, bins='auto', color='#2196F3', edgecolor='white', alpha=0.85)
plt.xlabel('Value')
plt.ylabel('Frequency')
plt.savefig('histogram.png', bbox_inches='tight')
```

### Box Plot

- Summarize distribution: median, IQR, whiskers, outliers.
- Excellent for comparing distributions across groups (3+ groups).
- Not ideal for showing bimodality or exact shape.

```python
plt.boxplot([group_a, group_b, group_c], labels=['A', 'B', 'C'],
            patch_artist=True, medianprops=dict(color='red'))
```

### Violin Plot

- Combines box plot with kernel density estimate showing distribution shape.
- Best when you need to show distribution shape AND compare across groups.
- Works well for bimodal or skewed data that box plots miss.

```python
import seaborn as sns
sns.violinplot(x='category', y='value', data=df, inner='box', palette='muted')
plt.savefig('violin.png', bbox_inches='tight')
```

### Heatmap

- Visualize a matrix of values with color intensity.
- Use for correlation matrices, confusion matrices, time-of-day patterns.
- Always include a color legend (colorbar) with labeled ticks.
- Order rows/columns meaningfully (clustering, hierarchy, or magnitude).

```python
import seaborn as sns
sns.heatmap(matrix, annot=True, fmt='.2f', cmap='RdBu_r', center=0,
            linewidths=0.5, cbar_kws={'label': 'Value'})
plt.savefig('heatmap.png', bbox_inches='tight')
```

### Pie / Donut Charts

- **When to use**: Exactly one series, exactly 2-5 slices, showing part-of-whole.
- **When NOT to use**: Comparing values across groups (use bars), many slices,
  precise value comparison, data where slices are similar size.
- Donut charts are generally preferred: center space available for a summary label.

### Treemap

- Show hierarchical composition with nested rectangles sized by value.
- Great for many categories (10-50+).
- Use when bar chart would be too long.

### Funnel Chart

- Show sequential stages of a process (conversion funnel).
- Stages should represent a strict subset relationship.
- Width of each stage = count or percentage at that stage.

### Waterfall Chart

- Show cumulative effect of sequential positive and negative values.
- Standard use: financial statements (revenue minus costs = profit).
- Running total line helps readability.

```python
# Waterfall with matplotlib
cumulative = np.cumsum(values, include_initial=True)
plt.bar(range(len(values)), values, bottom=cumulative[:-1],
        color=['green' if v > 0 else 'red' for v in values])
plt.axhline(y=0, color='black', linewidth=0.5)
```

### Candlestick Chart

- Show open/high/low/close for time series data (finance).
- Green/white body = closing > opening; red/black = closing < opening.
- Wicks show the high and low for the period.

### Radar / Spider Chart

- Compare multiple quantitative variables across a single entity.
- Best for 5-8 axes with the same scale.
- Overlaying 2-3 entities works; more becomes unreadable.

### Parallel Coordinates

- Show multi-dimensional data as parallel vertical axes connected by lines.
- Useful for detecting clusters and patterns across many dimensions.
- Normalize all axes to 0-1 range for comparability.
- Color-code by class for classification tasks.

### Sankey Diagram

- Show flow/movement between categories or stages.
- Node width = quantity at that stage.
- Link width = quantity flowing between nodes.
- Keep to 2-4 levels of depth for readability.

```python
# Using plotly
import plotly.graph_objects as go
fig = go.Figure(go.Sankey(
    node=dict(label=['Source', 'A', 'B', 'End']),
    link=dict(source=[0, 0, 1, 2], target=[1, 2, 3, 3],
              value=[10, 15, 8, 7])))
fig.write_image('sankey.png')
```

---

## Color Theory for Data Visualization

### Palette Types

| Type | Use Case | Examples |
|---|---|---|
| **Sequential** | Ordered data (low to high) | Viridis, Plasma, YlOrRd, Blues |
| **Diverging** | Data with meaningful center (above/below) | RdBu, PiYG, BrBG, coolwarm |
| **Categorical** | Nominal categories (no order) | Set2, Paired, Dark2, tab10 |
| **Highlight** | One category stands out | Gray for all, accent color for focus |

### Accessibility: Colorblind-Safe Palettes

Approximately 8% of men and 0.5% of women have some form of color vision deficiency.
- Use `viridis`, `cividis`, or `ColorBrewer` qualitative palettes (Set2, Dark2).
- Avoid relying solely on red-green distinctions.
- Always pair color with patterns, labels, or annotations.
- Test with `colorbrewer2.org` or `simulatingdaltonism.com`.

```python
# Colorblind-safe categorical palette
import matplotlib.pyplot as plt
cbsafe = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442']
for i, color in enumerate(cbsafe[:7]):
    plt.bar(i, height=1, color=color, label=f'Group {i}')
plt.legend()
```

### Max 7 Colors Rule

The human visual system can reliably distinguish about 7-9 distinct colors in a chart.
Beyond this threshold:
- Use grouping/faceting (small multiples).
- Reduce categories by combining "other" bucket.
- Use direct labels instead of a legend for many items.

---

## Design Rules

### Label Placement

- Axis labels: Outside the plot area, horizontal or rotated 0 deg if short.
- Data labels: Inside bars (if wide enough) or above/below points. Never overlap.
- Title: Top of chart, descriptive (what, where, when). Not "Figure 1".
- Subtitle: Context sentence below the title explaining the key takeaway.
- Source note: Bottom right, small font, data attribution.

### Axis Formatting

- Remove chart borders (spines) unless axes are meaningful.
- Grid lines: light gray, horizontal only (never vertical gridlines with bars).
- Tick marks: remove inner ticks; use outer ticks sparingly.
- Number formatting: comma-separate thousands, consistent decimals, no trailing zeros.
- Date formatting: YYYY-MM-DD or abbreviated month names; choose one and stick to it.
- Y-axis: Start at 0 for bar charts. Do NOT start at 0 for line charts showing change.

### Annotation Best Practices

```python
# Highlight a data point
plt.annotate('Peak: 1,247', xy=(idx, peak_val),
             xytext=(idx+1, peak_val+50),
             arrowprops=dict(arrowstyle='->', color='gray'),
             fontsize=10, color='black')
```

- Annotate the insight, not every point.
- Use callout lines sparingly (max 2-3 annotations per chart).
- Highlight the "so what" -- circle or bold the key value.

### When to Use Log Scale

- Data spans multiple orders of magnitude (e.g., 1 to 1,000,000).
- Multiplicative relationships (percent change, growth rates).
- **Never** use log scale for: data with zeros or negative values (use symlog),
  audience unfamiliar with log interpretation, data where absolute differences matter.

```python
plt.yscale('log')      # Standard log
plt.yscale('symlog')   # Symmetric log (handles 0 and negatives)
plt.yscale('logit')    # For probability data [0, 1]
```

### Avoiding Chart Junk

Chart junk is any visual element that does not contribute to understanding the data.
Remove or minimize:
- Unnecessary borders and box outlines.
- Background fills or gradients.
- 3D effects on 2D data (3D pie, 3D bar).
- Redundant legends when direct labels suffice.
- Clipart, icons, or decorative images.
- Excessive gridlines (horizontal only, very light).

### Chart Sizing

- Default font size: 10-12pt for body text, 14-16pt for titles.
- Minimum figure size for publication: 6x4 inches at 150 DPI.
- Dashboard thumbnails: 3x2 inches minimum for readability.
- Always set `figsize` explicitly; never rely on defaults.

```python
plt.figure(figsize=(10, 6), dpi=150)
```

---

## When to Use a Table Instead of a Chart

Charts are powerful, but sometimes a table is the better choice:

| Scenario | Use Table | Use Chart |
|---|---|---|
| Precise values needed | Yes | No |
| Comparing many individual values | Yes | No |
| Few data points (< 5 values) | Yes | Maybe |
| Showing trend over time | No | Yes |
| Audience needs exact numbers | Yes | No |
| Showing distribution shape | No | Yes |
| Geospatial patterns | No | Yes |
| Executive summary with KPIs | Yes | Maybe (both) |

### Table Design Rules

- Align numbers right, text left.
- Use alternating row shading (very light gray) for large tables.
- Bold the column headers; avoid underlines.
- Include a header row that describes units (e.g., "Revenue ($M)").
- Use conditional formatting to highlight key values.
- Maximum 5-7 columns for readability; split wide tables.

```python
import pandas as pd
# Styled table output
styled = df.style.format({'Revenue': '${:,.0f}', 'Growth': '{:.1%}'}) \
    .background_gradient(subset=['Growth'], cmap='RdYlGn') \
    .set_caption('Quarterly Performance Summary')
styled.to_html('table.html')
```

---

## Quick Reference: Choosing the Right Chart

```
How many variables?
├── 1 categorical, 1 numeric → Bar chart
├── 1 numeric → Histogram, box plot, violin
├── 1 categorical → Pie/donut (if 2-5 slices), horizontal bar
├── 2 numeric → Scatter plot, line (if time-ordered)
├── 2 categorical, 1 numeric → Grouped/stacked bar, heatmap
├── 3+ numeric → Scatter matrix, parallel coordinates, radar
├── Hierarchical → Treemap, sunburst
├── Flow/process → Sankey, funnel, waterfall
└── Geographic → Choropleth, bubble map
```
