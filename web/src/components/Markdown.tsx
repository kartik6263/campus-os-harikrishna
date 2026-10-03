import { Fragment, type ReactNode } from 'react';

/**
 * Just enough markdown for the assistant's replies: paragraphs, bullet lists,
 * tables, **bold** and `code`. Text is rendered as React text, never as HTML.
 */
export default function Markdown({ text, dark = false }: { text: string; dark?: boolean }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  const border = dark ? 'border-white/15' : 'border-[#D3D8E0]';

  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto my-2">
          <table className={`w-full text-[12px] border ${border}`}>
            {head && <thead><tr>{head.map((c, k) => <th key={k} className={`text-left font-semibold px-2 py-1.5 border-b ${border} ${dark ? 'bg-white/10' : 'bg-[#EDEFF3]'}`}>{inline(c)}</th>)}</tr></thead>}
            <tbody>{body.map((r, k) => <tr key={k} className={`border-b ${border} last:border-b-0`}>{r.map((c, m) => <td key={m} className="px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*•]\s+/.test(lines[i]!) || /^\s*\d+\.\s+/.test(lines[i]!))) {
        items.push(lines[i]!.replace(/^\s*([-*•]|\d+\.)\s+/, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={blocks.length} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 my-1.5 space-y-0.5`}>{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</List>);
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      blocks.push(<p key={blocks.length} className="font-semibold mt-2 mb-1">{inline(line.replace(/^#+\s/, ''))}</p>);
      i++;
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !/^\s*(\||[-*•]\s|\d+\.\s|#)/.test(lines[i]!)) { para.push(lines[i]!); i++; }
    blocks.push(<p key={blocks.length} className="my-1.5">{para.map((p, k) => <Fragment key={k}>{k > 0 && <br />}{inline(p)}</Fragment>)}</p>);
  }
  return <div className="leading-relaxed">{blocks}</div>;
}

function inline(s: string): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, k) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={k} className="font-mono text-[0.92em]">{p.slice(1, -1)}</code>;
    return <Fragment key={k}>{p}</Fragment>;
  });
}
