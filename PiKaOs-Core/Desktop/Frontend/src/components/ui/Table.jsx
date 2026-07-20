/**
 * Table — the .utable primitive: a header row + one row per datum.
 * columns: [{ key, header, render?, className? }] — className rides both the
 * header and the cell <span> (the grid items), so column-scoped CSS like the
 * .uc-* widths / responsive column-hiding keeps working. render(row) overrides
 * the raw row[key]. Row key = row.id ?? index.
 */
export default function Table({ columns, rows, onRowClick, rowClassName }) {
  return (
    <div className="utable">
      <div className="utable-th">
        {columns.map((c) => <span key={c.key} className={c.className}>{c.header}</span>)}
      </div>
      {rows.map((row, i) => (
        <div key={row.id ?? i}
          className={'utable-tr' + (rowClassName ? ' ' + rowClassName(row) : '')}
          onClick={onRowClick ? () => onRowClick(row) : undefined}>
          {columns.map((c) => <span key={c.key} className={c.className}>{c.render ? c.render(row) : row[c.key]}</span>)}
        </div>
      ))}
    </div>
  );
}
