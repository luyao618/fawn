import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radii, shadows, spacing, typography } from '../../shared/theme';
import { formatDate } from '../../lib/utils';

/**
 * Shared chrome for Dashboard cards — mobile equivalent of Web `<Card>`.
 */
export function StatsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

interface MiniBarChartProps {
  /** Bars are drawn left to right; older dates first. */
  values: Array<{ date: string; value: number | null }>;
  color: string;
  height?: number;
}

/**
 * Lightweight RN-only bar chart used by `FeedingStats` and `SleepStats`. We
 * avoid `recharts` because that's a Web-only dependency; the layouts here are
 * simple enough that View-based bars are sufficient on phone canvas widths.
 */
export function MiniBarChart({ values, color, height = 140 }: MiniBarChartProps) {
  const numericValues = values
    .map((point) => point.value)
    .filter((value): value is number => typeof value === 'number');
  const max = Math.max(0, ...numericValues);
  const safeMax = max === 0 ? 1 : max;

  return (
    <View style={[styles.barRow, { height }]}>
      {values.map((point, idx) => {
        const ratio = point.value == null ? 0 : Math.max(0, point.value) / safeMax;
        return (
          <View key={`${point.date}-${idx}`} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  height: `${ratio * 100}%`,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

type ChartAxis = 'left' | 'right' | 'hidden';

export interface DailyMetricChartSeries<T extends { date: string }> {
  id: string;
  label: string;
  color: string;
  kind: 'bar' | 'line';
  axis: ChartAxis;
  unit: string;
  getValue: (point: T) => number | null | undefined;
  formatValue?: (value: number) => string;
}

interface DailyMetricChartProps<T extends { date: string }> {
  data: T[];
  series: Array<DailyMetricChartSeries<T>>;
  leftAxisFormatter: (value: number) => string;
  rightAxisFormatter?: (value: number) => string;
  height?: number;
  visibleCount?: number;
  emptyLabel?: string;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasMeaningfulValue(value: number | null | undefined): boolean {
  return isFiniteNumber(value) && value > 0;
}

export function latestActiveWindow<T extends { date: string }>(
  data: T[],
  getValues: Array<(point: T) => number | null | undefined>,
  visibleCount = 7,
): T[] {
  if (data.length <= visibleCount) return data;
  let endIndex = data.length - 1;
  for (let index = data.length - 1; index >= 0; index -= 1) {
    const point = data[index];
    if (getValues.some((getValue) => hasMeaningfulValue(getValue(point)))) {
      endIndex = index;
      break;
    }
  }
  const startIndex = Math.max(0, endIndex - visibleCount + 1);
  return data.slice(startIndex, endIndex + 1);
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 4
          ? 4
          : normalized <= 8
            ? 8
            : 10;
  return niceNormalized * magnitude;
}

function formatMetricValue<T extends { date: string }>(
  series: DailyMetricChartSeries<T>,
  value: number,
) {
  if (series.formatValue) return series.formatValue(value);
  const rounded = Math.abs(value) >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded}${series.unit}`;
}

function axisKey<T extends { date: string }>(series: DailyMetricChartSeries<T>) {
  return series.axis === 'hidden' ? series.id : series.axis;
}

export function DailyMetricChart<T extends { date: string }>({
  data,
  series,
  leftAxisFormatter,
  rightAxisFormatter,
  height = 164,
  visibleCount = 7,
  emptyLabel = '这段时间暂无记录',
}: DailyMetricChartProps<T>) {
  const visibleData = React.useMemo(
    () => latestActiveWindow(data, series.map((item) => item.getValue), visibleCount),
    [data, series, visibleCount],
  );
  const [plotWidth, setPlotWidth] = React.useState(0);
  const axisMax = React.useMemo(() => {
    const next: Record<string, number> = {};
    series.forEach((item) => {
      const key = axisKey(item);
      const max = Math.max(
        0,
        ...visibleData
          .map((point) => item.getValue(point))
          .filter(isFiniteNumber),
      );
      next[key] = Math.max(next[key] ?? 0, niceMax(max));
    });
    next.left = next.left ?? 1;
    if (series.some((item) => item.axis === 'right')) next.right = next.right ?? 1;
    return next;
  }, [series, visibleData]);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    setSelectedIndex((current) =>
      current == null || current < visibleData.length ? current : null,
    );
  }, [visibleData.length]);

  const selectedPoint = selectedIndex == null ? null : visibleData[selectedIndex] ?? null;
  const hasRightAxis = series.some((item) => item.axis === 'right') && rightAxisFormatter;
  const hasAnyValue = visibleData.some((point) =>
    series.some((item) => isFiniteNumber(item.getValue(point))),
  );
  const leftTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => axisMax.left * ratio);
  const rightTicks = hasRightAxis
    ? [1, 0.75, 0.5, 0.25, 0].map((ratio) => (axisMax.right ?? 1) * ratio)
    : [];
  const barSeries = series.filter((item) => item.kind === 'bar');
  const lineSeries = series.filter((item) => item.kind === 'line');
  const plotCount = Math.max(1, visibleData.length);
  const slotWidth = plotWidth / plotCount;

  const getRatio = (value: number, item: DailyMetricChartSeries<T>) => {
    const max = axisMax[axisKey(item)] ?? 1;
    return Math.max(0, Math.min(1, value / max));
  };

  const xForIndex = (index: number) => ((index + 0.5) * plotWidth) / plotCount;
  const yForRatio = (ratio: number) => (1 - ratio) * height;

  return (
    <View style={styles.chartBlock}>
      <View style={styles.legendRow}>
        {series.map((item) => (
          <View key={item.id} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.chartFrame}>
        <View style={[styles.axisColumn, { height }]}>
          {leftTicks.map((tick) => (
            <Text key={`left-${tick}`} style={styles.axisLabel}>
              {leftAxisFormatter(tick)}
            </Text>
          ))}
        </View>

        <View
          style={[styles.plotArea, { height }]}
          onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((position) => (
            <View
              key={`grid-${position}`}
              style={[styles.gridLine, { top: `${position * 100}%` }]}
            />
          ))}

          <View style={styles.barLayer}>
            {visibleData.map((point, pointIndex) => (
              <View key={`bars-${point.date}-${pointIndex}`} style={styles.metricBarSlot}>
                <View style={styles.barCluster}>
                  {barSeries.map((item) => {
                    const value = item.getValue(point);
                    const ratio = isFiniteNumber(value) ? getRatio(value, item) : 0;
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.metricBar,
                          {
                            height: `${ratio * 100}%`,
                            backgroundColor: item.color,
                            opacity:
                              selectedIndex == null || pointIndex === selectedIndex
                                ? 1
                                : 0.56,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          {plotWidth > 0
            ? lineSeries.map((item) => {
                const points = visibleData.map((point, index) => {
                  const value = item.getValue(point);
                  if (!isFiniteNumber(value)) return null;
                  const ratio = getRatio(value, item);
                  return {
                    index,
                    x: xForIndex(index),
                    y: yForRatio(ratio),
                    value,
                  };
                });
                return (
                  <React.Fragment key={item.id}>
                    {points.map((point, index) => {
                      const next = points[index + 1];
                      if (!point || !next) return null;
                      const dx = next.x - point.x;
                      const dy = next.y - point.y;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <View
                          key={`${item.id}-segment-${index}`}
                          style={[
                            styles.lineSegment,
                            {
                              left: (point.x + next.x) / 2 - length / 2,
                              top: (point.y + next.y) / 2,
                              width: length,
                              backgroundColor: item.color,
                              transform: [{ rotate: `${angle}deg` }],
                            },
                          ]}
                        />
                      );
                    })}
                    {points.map((point) =>
                      point ? (
                        <View
                          key={`${item.id}-dot-${point.index}`}
                          style={[
                            styles.lineDot,
                            {
                              left: point.x - 4,
                              top: point.y - 4,
                              borderColor: item.color,
                              backgroundColor:
                                point.index === selectedIndex ? item.color : colors.card,
                            },
                          ]}
                        />
                      ) : null,
                    )}
                  </React.Fragment>
                );
              })
            : null}

          {plotWidth > 0 && selectedPoint && selectedIndex != null ? (
            <View
              pointerEvents="none"
              style={[
                styles.selectedGuide,
                { left: xForIndex(selectedIndex) - 0.5 },
              ]}
            />
          ) : null}

          {selectedPoint ? (
            <View pointerEvents="none" style={styles.selectedPanel}>
              <Text style={styles.selectedDate}>{formatDate(selectedPoint.date)}</Text>
              {series.map((item) => {
                const value = item.getValue(selectedPoint);
                if (!isFiniteNumber(value)) return null;
                return (
                  <Text key={item.id} style={[styles.selectedLine, { color: item.color }]}>
                    {item.label}: {formatMetricValue(item, value)}
                  </Text>
                );
              })}
            </View>
          ) : null}

          {!hasAnyValue ? (
            <Text pointerEvents="none" style={styles.chartEmpty}>
              {emptyLabel}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="收起统计明细"
            onPress={() => setSelectedIndex(null)}
            style={styles.plotBackgroundHit}
          />

          {plotWidth > 0 ? (
            <View pointerEvents="box-none" style={styles.hitLayer}>
              {visibleData.map((point, index) => {
                const targetRatio = Math.max(
                  0,
                  ...barSeries
                    .map((item) => {
                      const value = item.getValue(point);
                      return isFiniteNumber(value) ? getRatio(value, item) : 0;
                    })
                    .filter((value) => value > 0),
                );
                const hasTarget = targetRatio > 0;
                const targetHeight = hasTarget
                  ? Math.min(height, Math.max(28, targetRatio * height + 18))
                  : 28;
                return (
                  <Pressable
                    key={`hit-${point.date}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDate(point.date)}统计明细`}
                    onPress={() => setSelectedIndex(index)}
                    style={[
                      styles.hitSlot,
                      {
                        left: index * slotWidth + slotWidth * 0.16,
                        width: slotWidth * 0.68,
                        height: targetHeight,
                      },
                    ]}
                  />
                );
              })}
            </View>
          ) : null}
        </View>

        {hasRightAxis ? (
          <View style={[styles.axisColumnRight, { height }]}>
            {rightTicks.map((tick) => (
              <Text key={`right-${tick}`} style={styles.axisLabel}>
                {rightAxisFormatter(tick)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.xAxisRow}>
        <View style={styles.axisSpacer} />
        <View style={styles.xLabels}>
          {visibleData.map((point, index) => (
            <Text
              key={`x-${point.date}-${index}`}
              style={[
                styles.xLabel,
                selectedIndex != null && index === selectedIndex && styles.xLabelSelected,
              ]}
              numberOfLines={1}
            >
              {formatDate(point.date, 'M/d')}
            </Text>
          ))}
        </View>
        {hasRightAxis ? <View style={styles.axisSpacerRight} /> : null}
      </View>
    </View>
  );
}

export function StatNumber({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statNumberBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  title: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing['1'],
    marginTop: spacing['4'],
  },
  metricBarSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  chartBlock: {
    marginTop: spacing['4'],
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing['3'],
    marginBottom: spacing['2'],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['1'],
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: radii.full,
  },
  legendText: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
  chartFrame: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  axisColumn: {
    width: 42,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: spacing['1'],
  },
  axisColumnRight: {
    width: 34,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingLeft: spacing['1'],
  },
  axisLabel: {
    ...typography.caption,
    color: colors['dark-gray'],
    fontSize: 10,
  },
  plotArea: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors['oat-border'],
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors['warm-gray'],
  },
  barLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barCluster: {
    width: '68%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  metricBar: {
    flex: 1,
    maxWidth: 14,
    minHeight: 2,
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  lineSegment: {
    position: 'absolute',
    height: 2,
    borderRadius: radii.full,
  },
  lineDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: radii.full,
    borderWidth: 2,
  },
  selectedGuide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors['mid-gray'],
    opacity: 0.35,
  },
  selectedPanel: {
    position: 'absolute',
    top: spacing['2'],
    right: spacing['2'],
    minWidth: 132,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    backgroundColor: colors['card-translucent'],
    borderRadius: radii.sm,
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['2'],
  },
  selectedDate: {
    ...typography.bodySmall,
    color: colors['soft-charcoal'],
    fontFamily: fontFamily.sansSemibold,
    marginBottom: spacing['1'],
  },
  selectedLine: {
    ...typography.caption,
    fontFamily: fontFamily.sansSemibold,
    marginTop: 2,
  },
  chartEmpty: {
    ...typography.bodySmall,
    position: 'absolute',
    left: 0,
    right: 0,
    top: '45%',
    textAlign: 'center',
    color: colors['mid-gray'],
  },
  plotBackgroundHit: {
    ...StyleSheet.absoluteFillObject,
  },
  hitLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  hitSlot: {
    position: 'absolute',
    bottom: 0,
  },
  xAxisRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing['1'],
  },
  axisSpacer: {
    width: 42,
  },
  axisSpacerRight: {
    width: 34,
  },
  xLabels: {
    flex: 1,
    flexDirection: 'row',
  },
  xLabel: {
    ...typography.caption,
    flex: 1,
    color: colors['dark-gray'],
    textAlign: 'center',
    fontSize: 10,
  },
  xLabelSelected: {
    color: colors['soft-charcoal'],
    fontFamily: fontFamily.sansSemibold,
  },
  statNumberBlock: {
    minWidth: 0,
  },
  statValue: {
    fontFamily: fontFamily.mono,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: colors['soft-charcoal'],
  },
  statLabel: {
    ...typography.caption,
    color: colors['dark-gray'],
    marginTop: spacing['1'],
  },
});
