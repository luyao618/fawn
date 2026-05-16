import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { GrowthChartData, WHOReferenceLines, WHOReferencePoint } from '../shared/api';

type Indicator = 'weight' | 'height' | 'head';

interface Props {
  data: GrowthChartData;
  birthDate: string | null;
}

const INDICATOR_LABEL: Record<Indicator, string> = {
  weight: '体重',
  height: '身高',
  head: '头围',
};

const INDICATOR_UNIT: Record<Indicator, string> = {
  weight: 'kg',
  height: 'cm',
  head: 'cm',
};

const DAY_MS = 86_400_000;
const CHART_HEIGHT = 220;

function actualValue(
  record: GrowthChartData['records'][number],
  indicator: Indicator,
): number | null {
  if (indicator === 'weight') {
    return record.weight_g == null ? null : record.weight_g / 1000;
  }
  if (indicator === 'height') return record.height_cm;
  return record.head_cm;
}

function referenceValue(point: WHOReferencePoint, indicator: Indicator): number {
  // Backend may store weight in grams when value > 100, see dashboard.py.
  if (indicator === 'weight' && point.value > 100) return point.value / 1000;
  return point.value;
}

function ageMonthsFrom(dateIso: string, originIso: string): number {
  const days = (new Date(dateIso).getTime() - new Date(originIso).getTime()) / DAY_MS;
  return Math.max(0, days) / 30.4375;
}

interface Point {
  x: number; // age in months
  y: number; // value in display units
}

function buildActualPoints(
  records: GrowthChartData['records'],
  originIso: string | null,
  indicator: Indicator,
): Point[] {
  if (!originIso) return [];
  const out: Point[] = [];
  for (const record of records) {
    const value = actualValue(record, indicator);
    if (value == null) continue;
    out.push({ x: ageMonthsFrom(record.date, originIso), y: value });
  }
  return out.sort((a, b) => a.x - b.x);
}

function buildReferencePoints(
  reference: WHOReferenceLines,
  indicator: Indicator,
  key: keyof WHOReferenceLines,
): Point[] {
  return reference[key]
    .map((p) => ({ x: p.age_months, y: referenceValue(p, indicator) }))
    .sort((a, b) => a.x - b.x);
}

function niceTickValues(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export function GrowthChart({ data, birthDate }: Props) {
  const [indicator, setIndicator] = useState<Indicator>('weight');
  const [width, setWidth] = useState(0);
  const unit = INDICATOR_UNIT[indicator];
  const reference = data.who_reference[indicator];
  const firstRecordDate = data.records[0]?.date ?? null;
  const originIso = birthDate ?? firstRecordDate;

  const { actualPoints, referenceSeries, xDomain, yDomain } = useMemo(() => {
    const actual = buildActualPoints(data.records, originIso, indicator);
    const refKeys = ['p3', 'p15', 'p50', 'p85', 'p97'] as const;
    const refSeries = refKeys.map((key) => ({
      key,
      points: buildReferencePoints(reference, indicator, key),
    }));

    const allX = [
      ...actual.map((p) => p.x),
      ...refSeries.flatMap((s) => s.points.map((p) => p.x)),
    ];
    const allY = [
      ...actual.map((p) => p.y),
      ...refSeries.flatMap((s) => s.points.map((p) => p.y)),
    ];
    const xMin = allX.length ? Math.min(...allX) : 0;
    const xMax = allX.length ? Math.max(...allX) : 6;
    const yMinRaw = allY.length ? Math.min(...allY) : 0;
    const yMaxRaw = allY.length ? Math.max(...allY) : 1;
    const pad = (yMaxRaw - yMinRaw) * 0.1 || 0.5;

    return {
      actualPoints: actual,
      referenceSeries: refSeries,
      xDomain: [xMin, xMax === xMin ? xMin + 1 : xMax] as [number, number],
      yDomain: [Math.max(0, yMinRaw - pad), yMaxRaw + pad] as [number, number],
    };
  }, [data.records, indicator, originIso, reference]);

  const plotWidth = Math.max(0, width - 48);
  const plotHeight = CHART_HEIGHT - 24;

  const projectX = (x: number): number =>
    ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const projectY = (y: number): number =>
    plotHeight - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight;

  const yTicks = niceTickValues(yDomain[0], yDomain[1], 4);
  const xTicks = niceTickValues(xDomain[0], xDomain[1], 4);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>生长曲线</Text>
        <View style={styles.tabs}>
          {(Object.keys(INDICATOR_LABEL) as Indicator[]).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setIndicator(key)}
              style={[styles.tab, indicator === key && styles.tabActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.tabText, indicator === key && styles.tabTextActive]}>
                {INDICATOR_LABEL[key]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {data.records.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无生长记录</Text>
        </View>
      ) : (
        <View
          style={styles.plotWrapper}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        >
          {/* Y axis labels */}
          <View style={[styles.yAxis, { height: plotHeight }]}>
            {yTicks
              .slice()
              .reverse()
              .map((t) => (
                <Text key={`y-${t}`} style={styles.axisLabel}>
                  {t.toFixed(indicator === 'weight' ? 1 : 0)}
                  {unit}
                </Text>
              ))}
          </View>

          <View style={{ flex: 1 }}>
            {/* Plot area */}
            <View style={[styles.plot, { width: plotWidth, height: plotHeight }]}>
              {/* Horizontal grid */}
              {yTicks.map((t) => (
                <View
                  key={`grid-${t}`}
                  style={[styles.gridLine, { top: projectY(t) }]}
                />
              ))}

              {/* WHO reference lines (dashed approximation via small dots) */}
              {referenceSeries.map((series) =>
                series.points.length < 2
                  ? null
                  : series.points
                      .slice(0, -1)
                      .map((p, i) =>
                        renderSegment(
                          `${series.key}-${i}`,
                          projectX(p.x),
                          projectY(p.y),
                          projectX(series.points[i + 1].x),
                          projectY(series.points[i + 1].y),
                          '#D6D0C8',
                          1,
                          true,
                          series.key === 'p50',
                        ),
                      ),
              )}

              {/* Actual measurement line */}
              {actualPoints.length >= 2 &&
                actualPoints
                  .slice(0, -1)
                  .map((p, i) =>
                    renderSegment(
                      `actual-${i}`,
                      projectX(p.x),
                      projectY(p.y),
                      projectX(actualPoints[i + 1].x),
                      projectY(actualPoints[i + 1].y),
                      '#D4956A',
                      2.4,
                      false,
                      false,
                    ),
                  )}

              {/* Actual measurement dots */}
              {actualPoints.map((p, i) => (
                <View
                  key={`dot-${i}`}
                  style={[
                    styles.dot,
                    { left: projectX(p.x) - 4, top: projectY(p.y) - 4 },
                  ]}
                />
              ))}
            </View>

            {/* X axis labels */}
            <View style={[styles.xAxis, { width: plotWidth }]}>
              {xTicks.map((t) => (
                <Text
                  key={`x-${t}`}
                  style={[
                    styles.axisLabel,
                    { position: 'absolute', left: projectX(t) - 16 },
                  ]}
                >
                  {formatAge(t)}
                </Text>
              ))}
            </View>
          </View>
        </View>
      )}

      <Text style={styles.legend}>WHO 参考线为灰色虚线（P3/P15/P50/P85/P97）</Text>
    </View>
  );
}

function renderSegment(
  key: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  thickness: number,
  dashed: boolean,
  emphasized: boolean,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <View
      key={key}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x1,
        top: y1 - thickness / 2,
        width: length,
        height: thickness,
        backgroundColor: color,
        opacity: dashed ? (emphasized ? 0.85 : 0.5) : 1,
        transform: [{ translateY: 0 }, { rotate: `${angle}deg` }],
        transformOrigin: '0% 50%',
      }}
    />
  );
}

function formatAge(months: number): string {
  if (months < 1) {
    const days = Math.max(0, Math.round(months * 30.4375));
    return `${days}天`;
  }
  if (months < 12) {
    const whole = Math.round(months * 10) / 10;
    return `${whole}月`;
  }
  const years = Math.round((months / 12) * 10) / 10;
  return `${years}岁`;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#f2ede8',
    borderRadius: 8,
    padding: 2,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 13,
    color: '#666',
  },
  tabTextActive: {
    color: '#D4956A',
    fontWeight: '600',
  },
  empty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
  },
  plotWrapper: {
    flexDirection: 'row',
    paddingTop: 4,
  },
  yAxis: {
    width: 44,
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  plot: {
    position: 'relative',
    backgroundColor: '#fafafa',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#eee',
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D4956A',
  },
  xAxis: {
    height: 20,
    marginTop: 4,
    position: 'relative',
  },
  axisLabel: {
    fontSize: 11,
    color: '#888',
  },
  legend: {
    marginTop: 8,
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
});
