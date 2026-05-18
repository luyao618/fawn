import React from 'react';
import { Linking, StyleSheet, Text, TextStyle, View } from 'react-native';

import { colors, fontFamily, layout, radii, spacing, typography } from '../../shared/theme';

/**
 * Lightweight Markdown renderer for chat bubbles.
 *
 * Mirrors `frontend/src/components/chat/MarkdownMessage.tsx`:
 *   - paragraphs (with inline bold / code / links)
 *   - ATX headings #/##/###
 *   - ordered / unordered lists
 *   - fenced code blocks (```)
 *   - GFM-ish tables
 *
 * All visual styling is sourced from `shared/theme.ts` tokens — no hex / size
 * literals in this file.
 */

type MarkdownBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'code'; code: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'hr' };

interface Props {
  content: string;
  /** Text color used for plain paragraph / list text. */
  textColor?: string;
  /** Override the inline link color (defaults to brand info-blue). */
  linkColor?: string;
}

function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.includes('|') && parseTableRow(line).length > 1;
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return (
    cells.length > 1 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
  );
}

function orderedListText(line: string): string | null {
  return line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1] ?? null;
}

function unorderedListText(line: string): string | null {
  return line.match(/^\s*[-*+]\s+(.+)$/)?.[1] ?? null;
}

function startsBlock(line: string, nextLine?: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('```') ||
    /^#{1,3}\s+/.test(trimmed) ||
    /^(---|\*\*\*|___)\s*$/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    orderedListText(line) !== null ||
    unorderedListText(line) !== null ||
    (nextLine !== undefined && isTableRow(line) && isTableSeparator(nextLine))
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', code: codeLines.join('\n') });
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'blockquote', lines: bqLines });
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      i += 1;
      continue;
    }

    if (i + 1 < lines.length && isTableRow(line) && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && isTableRow(lines[i])) {
        if (!isTableSeparator(lines[i])) rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const ordered = orderedListText(line);
    if (ordered !== null) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = orderedListText(lines[i]);
        if (item === null) break;
        items.push(item);
        i += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const unordered = unorderedListText(line);
    if (unordered !== null) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = unorderedListText(lines[i]);
        if (item === null) break;
        items.push(item);
        i += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !startsBlock(lines[i], lines[i + 1])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}

function renderInline(text: string, baseColor: string, linkColor: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`t-${lastIndex}`} style={{ color: baseColor }}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      );
    }

    if (match[2] || match[3]) {
      nodes.push(
        <Text
          key={`b-${match.index}`}
          style={{ fontFamily: fontFamily.sansSemibold, color: baseColor }}
        >
          {match[2] ?? match[3]}
        </Text>,
      );
    } else if (match[4]) {
      nodes.push(
        <Text
          key={`c-${match.index}`}
          style={[styles.inlineCode, { color: baseColor }]}
        >
          {match[4]}
        </Text>,
      );
    } else if (match[5] && match[6]) {
      const href = match[6];
      nodes.push(
        <Text
          key={`l-${match.index}`}
          style={[styles.link, { color: linkColor }]}
          onPress={() => Linking.openURL(href).catch(() => undefined)}
        >
          {match[5]}
        </Text>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Text key={`tend`} style={{ color: baseColor }}>
        {text.slice(lastIndex)}
      </Text>,
    );
  }

  return nodes.length ? nodes : [<Text key="raw" style={{ color: baseColor }}>{text}</Text>];
}

export function MarkdownMessage({
  content,
  textColor = colors['soft-charcoal'],
  linkColor = colors['info-blue'],
}: Props) {
  const blocks = React.useMemo(() => parseMarkdown(content), [content]);
  if (blocks.length === 0) return null;

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <Text key={index} style={[typography.body, { color: textColor }]}>
              {block.lines.map((line, li) => (
                <React.Fragment key={li}>
                  {li > 0 ? <Text>{'\n'}</Text> : null}
                  {renderInline(line, textColor, linkColor)}
                </React.Fragment>
              ))}
            </Text>
          );
        }

        if (block.type === 'heading') {
          return (
            <Text key={index} style={[styles.heading, { color: textColor }]}>
              {renderInline(block.text, textColor, linkColor)}
            </Text>
          );
        }

        if (block.type === 'ordered-list' || block.type === 'unordered-list') {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, ii) => (
                <View key={ii} style={styles.listItem}>
                  <Text style={[typography.body, styles.listMarker, { color: textColor }]}>
                    {block.type === 'ordered-list' ? `${ii + 1}.` : '•'}
                  </Text>
                  <Text style={[typography.body, styles.listText, { color: textColor }]}>
                    {renderInline(item, textColor, linkColor)}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        if (block.type === 'code') {
          return (
            <View key={index} style={styles.codeBlock}>
              <Text style={styles.codeText}>{block.code}</Text>
            </View>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <View key={index} style={styles.blockquote}>
              {block.lines.map((line, li) => (
                <Text key={li} style={[typography.body, { color: textColor }]}>
                  {renderInline(line, textColor, linkColor)}
                </Text>
              ))}
            </View>
          );
        }

        if (block.type === 'hr') {
          return <View key={index} style={styles.hr} />;
        }

        return (
          <View key={index} style={styles.table}>
            <View style={styles.tableRow}>
              {block.headers.map((header, hi) => (
                <Text
                  key={hi}
                  style={[styles.tableCell, styles.tableHeader, { color: textColor }]}
                >
                  {header}
                </Text>
              ))}
            </View>
            {block.rows.map((row, ri) => (
              <View key={ri} style={styles.tableRow}>
                {block.headers.map((_, ci) => (
                  <Text
                    key={ci}
                    style={[styles.tableCell, { color: textColor }]}
                  >
                    {row[ci] ?? ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing['2'],
  },
  heading: {
    ...typography.markdownHeading,
  } satisfies TextStyle,
  list: {
    gap: spacing['1'],
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing['2'],
  },
  listMarker: {
    minWidth: layout.markdownListMarker,
  },
  listText: {
    flex: 1,
  },
  inlineCode: {
    fontFamily: fontFamily.mono,
    backgroundColor: colors['code-surface'],
    paddingHorizontal: spacing['1'],
    borderRadius: radii.sm,
  },
  link: {
    fontFamily: fontFamily.sansSemibold,
    textDecorationLine: 'underline',
  },
  codeBlock: {
    backgroundColor: colors['code-surface'],
    borderRadius: radii.md,
    padding: spacing['2'],
  },
  codeText: {
    ...typography.code,
  },
  table: {
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    ...typography.tableCell,
    flex: 1,
    paddingVertical: spacing['1'],
    paddingHorizontal: spacing['2'],
    borderBottomWidth: 1,
    borderColor: colors['oat-border'],
  },
  tableHeader: {
    fontFamily: fontFamily.sansSemibold,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors['mid-gray'],
    paddingLeft: spacing['3'],
    gap: spacing['2'],
  },
  hr: {
    height: 1,
    backgroundColor: colors['oat-border'],
    marginVertical: spacing['3'],
  },
});
