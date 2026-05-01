import { cn } from '@/lib/utils';

type MarkdownBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'code'; code: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

function parseTableRow(line: string) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableRow(line: string) {
  return line.includes('|') && parseTableRow(line).length > 1;
}

function isTableSeparator(line: string) {
  const cells = parseTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function orderedListText(line: string) {
  return line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1] ?? null;
}

function unorderedListText(line: string) {
  return line.match(/^\s*[-*+]\s+(.+)$/)?.[1] ?? null;
}

function startsBlock(line: string, nextLine?: string) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('```') ||
    /^#{1,3}\s+/.test(trimmed) ||
    orderedListText(line) !== null ||
    unorderedListText(line) !== null ||
    (nextLine !== undefined && isTableRow(line) && isTableSeparator(nextLine))
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', code: codeLines.join('\n') });
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && isTableRow(line) && isTableSeparator(lines[index + 1])) {
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && isTableRow(lines[index])) {
        if (!isTableSeparator(lines[index])) rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const ordered = orderedListText(line);
    if (ordered !== null) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = orderedListText(lines[index]);
        if (item === null) break;
        items.push(item);
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const unordered = unorderedListText(line);
    if (unordered !== null) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = unorderedListText(lines[index]);
        if (item === null) break;
        items.push(item);
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsBlock(lines[index], lines[index + 1])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}

function renderInline(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    if (match[2] || match[3]) {
      nodes.push(
        <strong key={`strong-${match.index}`} className="font-semibold">
          {match[2] ?? match[3]}
        </strong>,
      );
    } else if (match[4]) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded bg-white/70 px-1 py-0.5 font-mono text-[0.92em]">
          {match[4]}
        </code>,
      );
    } else if (match[5] && match[6]) {
      nodes.push(
        <a
          key={`link-${match.index}`}
          href={match[6]}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-info-blue underline underline-offset-2"
        >
          {match[5]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : text;
}

function renderLines(lines: string[]) {
  return lines.map((line, index) => (
    <span key={`${index}-${line}`}>
      {index > 0 ? <br /> : null}
      {renderInline(line)}
    </span>
  ));
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const blocks = parseMarkdown(content);

  if (blocks.length === 0) return null;

  return (
    <div className={cn('space-y-2 break-words', className)}>
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <p key={index} className="whitespace-pre-wrap">
              {renderLines(block.lines)}
            </p>
          );
        }

        if (block.type === 'heading') {
          const className = 'text-[17px] font-semibold leading-snug';
          if (block.level === 1) {
            return (
              <h1 key={index} className={className}>
                {renderInline(block.text)}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2 key={index} className={className}>
                {renderInline(block.text)}
              </h2>
            );
          }
          return (
            <h3 key={index} className={className}>
              {renderInline(block.text)}
            </h3>
          );
        }

        if (block.type === 'ordered-list' || block.type === 'unordered-list') {
          const Tag = block.type === 'ordered-list' ? 'ol' : 'ul';
          return (
            <Tag
              key={index}
              className={cn(
                'space-y-1 pl-5',
                block.type === 'ordered-list' ? 'list-decimal' : 'list-disc',
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`} className="pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </Tag>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={index} className="overflow-x-auto rounded-lg bg-white/70 p-2 font-mono text-sm leading-relaxed">
              <code>{block.code}</code>
            </pre>
          );
        }

        return (
          <div key={index} className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {block.headers.map((header, headerIndex) => (
                    <th
                      key={`${headerIndex}-${header}`}
                      scope="col"
                      className="border-b border-oat-border px-2 py-1 text-left font-semibold text-soft-charcoal first:pl-0"
                    >
                      {renderInline(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {block.headers.map((_, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-b border-oat-border/70 px-2 py-1 text-soft-charcoal first:pl-0"
                      >
                        {renderInline(row[cellIndex] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
