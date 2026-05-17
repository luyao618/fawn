import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadows, spacing, typography } from '../../shared/theme';
import type {
  GrowthChartData,
  WHOReferenceLines,
  WHOReferencePoint,
} from '../../shared/api';

/**
 * Token-driven Growth chart for the mobile Dashboard. Mirrors
 * `frontend/src/components/dashboard/GrowthChart.tsx` — three-way indicator
 * tabs (weight / height / head), WHO percentile reference lines as dashed
 * lookalikes, and the actual measurement series on top.
 *
 * Implementation is intentionally View-based instead of pulling `recharts` /
 * `react-native-svg` so we don't add a heavy dependency just for one screen.
 */

type Indicator = 'weight' | 'height' | 'head';

const INDICATOR_LABEL: Record<Indicator, string> = {
  weight: '体重',
  height: '身高',
  head: '头围',
};

const INDICATOR_UNIT: Record<Indicator, 'kg' | 'cm'> = {
  weight: 'kg',
  height: 'cm',
  head: 'cm',
};

const DAY_MS = 86_400_000;
const CHART_HEIGHT = 220;

interface Props {
  data: GrowthChartData;
  birthDate?: string | null;
}

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

function referenceValue(point: WHOReferencePoint, indicator: Indicator) {
  // Backend stores weight in grams when value > 100 — same convention as Web.
  if (indicator === 'weight' && point.value > 100) return point.value / 1000;
  return point.value;
}

function ageMonthsFrom(dateIso: string, originIso: string) {
  const days = (new Date(dateIso).getTime() - new Date(originIso).getTime()) / DAY_MS;
  return Math.max(0, days) / 30.4375;
}

interface Point {
  x: number;
  y: number;
}

function buildActualPoints(
  records: GrowthChartData['records'],
  originIso: string | null,
  indicator: Indicator,
): Point[] {
  if (!originIso) return [];
  const points: Point[] = [];
  for (const record of records) {
    const value = actualValue(record, indicator);
    if (value == null) continue;
    points.push({ x: ageMonthsFrom(record.date, originIso), y: value });
  }
  return points.sort((a, b) => a.x - b.x);
}

function buildReferencePoints(
  reference: WHOReferenceLines,
  indicator: Indicator,
  key: keyof WHOReferenceLines,
): Point[] {
  return reference[key]
    .map((point) => ({ x: point.age_months, y: referenceValue(point, indicator) }))
    .sort((a, b) => a.x - b.x);
}

function niceTicks(min: number, max: number, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

function formatAge(months: number) {
  if (months < 1) {
    return `${Math.max(0, Math.round(months * 30.4375))}天`;
  }
  if (months < 12) {
    return `${Math.round(months * 10) / 10}月`;
  }
  return `${Math.round((months / 12) * 10) / 10}岁`;
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
    const xMin = allX.length > 0 ? Math.min(...allX) : 0;
    const xMax = allX.length > 0 ? Math.max(...allX) : 6;
    const yMinRaw = allY.length > 0 ? Math.min(...allY) : 0;
    const yMaxRaw = allY.length > 0 ? Math.max(...allY) : 1;
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

  const projectX = (x: number) =>
    ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const projectY = (y: number) =>
    plotHeight - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight;

  const yTicks = niceTicks(yDomain[0], yDomain[1], 4);
  const xTicks = niceTicks(xDomain[0], xDomain[1], 4);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.heading}>生长曲线</Text>
        <View style={styles.tabs}>
          {(Object.keys(INDICATOR_LABEL) as Indicator[]).map((key) => {
            const active = indicator === key;
            return (
              <Pressable
                key={key}
                onPress={() => setIndicator(key)}
                accessibilityRole="button"
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {INDICATOR_LABEL[key]}
                </Text>
              </Pressable>
            );
          })}
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
          <View style={[styles.yAxis, { height: plotHeight }]}>
            {yTicks
              .slice()
              .reverse()
              .map((tick) => (
                <Text key={`y-${tick}`} style={styles.axisLabel}>
                  {tick.toFixed(indicator === 'weight' ? 1 : 0)}
                  {unit}
                </Text>
              ))}
          </View>

          <View style={styles.plotColumn}>
            <View style={[styles.plot, { width: plotWidth, height: plotHeight }]}>
              {yTicks.map((tick) => (
                <View
                  key={`grid-${tick}`}
                  style={[styles.gridLine, { top: projectY(tick) }]}
                />
              ))}

              {referenceSeries.map((series) =>
                series.points.length < 2
                  ? null
                  : series.points
                      .slice(0, -1)
                      .map((point, i) =>
                        renderSegment(
                          `${series.key}-${i}`,
                          projectX(point.x),
                          projectY(point.y),
                          projectX(series.points[i + 1].x),
                          projectY(series.points[i + 1].y),
                          colors['chart-reference'],
                          1,
                          true,
                          series.key === 'p50',
                        ),
                      ),
              )}

              {actualPoints.length >= 2 &&
                actualPoints
                  .slice(0, -1)
                  .map((point, i) =>
                    renderSegment(
                      `actual-${i}`,
                      projectX(point.x),
                      projectY(point.y),
                      projectX(actualPoints[i + 1].x),
                      projectY(actualPoints[i + 1].y),
                      colors['fawn-amber'],
                      2.4,
                      false,
                      false,
                    ),
                  )}

              {actualPoints.map((point, i) => (
                <View
                  key={`dot-${i}`}
                  style={[
                    styles.dot,
                    {
                      left: projectX(point.x) - 4,
                      top: projectY(point.y) - 4,
                    },
                  ]}
                />
              ))}
            </View>

            <View style={[styles.xAxis, { width: plotWidth }]}>
              {xTicks.map((tick) => (
                <Text
                  key={`x-${tick}`}
                  style={[styles.axisLabel, styles.xAxisLabel, { left: projectX(tick) - 16 }]}
                >
                  {formatAge(tick)}
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
        transform: [{ rotate: `${angle}deg` }],
        transformOrigin: '0% 50%',
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing['4'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['3'],
  },
  heading: {
    ...typography.heading,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.md,
    padding: spacing['1'],
  },
  tab: {
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.sm,
  },
  tabActive: {
    backgroundColor: colors.card,
    ...shadows.card,
  },
  tabText: {
    ...typography.bodySmall,
  },
  tabTextActive: {
    color: colors['fawn-amber'],
    fontWeight: '600',
  },
  empty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.md,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
  },
  plotWrapper: {
    flexDirection: 'row',
    paddingTop: spacing['1'],
  },
  yAxis: {
    width: 44,
    justifyContent: 'space-between',
    paddingRight: spacing['1'],
  },
  plotColumn: {
    flex: 1,
  },
  plot: {
    position: 'relative',
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors['oat-border'],
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors['fawn-amber'],
  },
  xAxis: {
    height: 20,
    marginTop: spacing['1'],
    position: 'relative',
  },
  xAxisLabel: {
    position: 'absolute',
  },
  axisLabel: {
    ...typography.caption,
  },
  legend: {
    marginTop: spacing['2'],
    ...typography.caption,
    fontStyle: 'italic',
  },
});
