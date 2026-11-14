import { Icon } from './icons.jsx';

function Inline({ text }) {
  const parts = String(text).split('`');
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="rounded border border-line bg-mist px-1 py-[1px] font-mono text-[11.5px]">
        {part}
      </code>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

/** 极简 Markdown 渲染：标题、列表、表格、代码块与内联代码 */
export function Markdown({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={`code-${index}`} className="overflow-x-auto rounded-lg border border-line bg-mist px-3 py-2.5">
          <code className="font-mono text-[11.5px] leading-5">{code.join('\n')}</code>
        </pre>
      );
      continue;
    }
    if (line.startsWith('#')) {
      const level = line.match(/#+/)?.[0].length || 1;
      const content = line.replace(/^#+\s*/, '');
      const className =
        level === 1
          ? 'text-[19px] font-semibold tracking-tight mt-2'
          : level === 2
            ? 'text-[14px] font-semibold tracking-tight mt-3'
            : 'text-[12.5px] font-semibold mt-2';
      blocks.push(
        <h3 key={`h-${index}`} className={className}>
          <Inline text={content} />
        </h3>
      );
      index += 1;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        rows.push(lines[index]);
        index += 1;
      }
      const cells = rows
        .map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()))
        .filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
      blocks.push(
        <div key={`t-${index}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr>
                {cells[0]?.map((cell, cellIndex) => (
                  <th key={cellIndex} className="border-b border-line px-2 py-1.5 text-left font-medium text-ink">
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cells.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b border-line2 px-2 py-1.5 text-muted2">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (index < lines.length && lines[index].startsWith('- ')) {
        items.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push(
        <ul key={`l-${index}`} className="flex flex-col gap-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex gap-2 text-[12.5px] leading-5 text-slate1">
              <Icon name="chevronRight" size={12} className="mt-[3px] shrink-0 text-muted2" />
              <span className="min-w-0 flex-1">
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    blocks.push(
      <p key={`p-${index}`} className="text-[12.5px] leading-6 text-slate1">
        <Inline text={line} />
      </p>
    );
    index += 1;
  }
  return <div className="flex flex-col gap-2.5">{blocks}</div>;
}
