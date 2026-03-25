export function table(rows: Record<string, unknown>[], columns: string[]) {
  if (rows.length === 0) {
    console.log('No results.');
    return;
  }
  console.log(columns.map((c) => c.padEnd(20)).join(''));
  console.log(columns.map(() => '─'.repeat(20)).join(''));
  for (const row of rows) {
    console.log(
      columns
        .map((c) => {
          const val = row[c];
          const str = val === null || val === undefined ? '—' : String(val);
          return str.slice(0, 19).padEnd(20);
        })
        .join(''),
    );
  }
}
