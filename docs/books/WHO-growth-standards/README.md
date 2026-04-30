# WHO Child Growth Standards — Data Tables

Source: https://www.who.int/tools/child-growth-standards/standards
Downloaded: 2026-04-30

## Directory Structure

```
WHO-growth-standards/
├── weight-for-age/       # 体重-年龄 (WFA)
├── length-for-age/       # 身长-年龄 (LHFA)
└── head-circumference/   # 头围-年龄 (HCFA)
```

## File Naming Convention

`{indicator}_{gender}_{range}_{type}.xlsx`

- **indicator**: `wfa` / `lhfa` / `hcfa`
- **gender**: `boys` / `girls`
- **range**: `0-13w` (birth to 13 weeks), `0-2y`, `0-5y`
- **type**: `zscores` / `percentiles` / `zscores_expanded` / `percentiles_expanded`

## Key Files for Fawn (0-6 month tracker)

**Expanded tables contain L/M/S parameters** for programmatic z-score calculation:

| File | Usage |
|------|-------|
| `*_zscores_expanded.xlsx` | L (Box-Cox power), M (median), S (coefficient of variation) by day-of-age |
| `*_0-13w_zscores.xlsx` | Weekly z-score reference tables (birth to 13 weeks) |

### Z-score formula

```
z = ((measurement / M) ^ L - 1) / (L * S)    when L ≠ 0
z = ln(measurement / M) / S                   when L = 0
```

Percentile = Φ(z) where Φ is the standard normal CDF.
