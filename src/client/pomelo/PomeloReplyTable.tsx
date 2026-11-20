import { Button } from "../components/ui/button.js";
import { tableView, type TableViewInput } from "./reply-table.js";

type PomeloReplyTableProps = TableViewInput & {
  onShowAll: () => void;
};

export function PomeloReplyTable({ header, rows, messageDir, expanded, onShowAll }: PomeloReplyTableProps) {
  const view = tableView({ header, rows, messageDir, expanded });
  if (!view) return null;

  return (
    <div dir={view.dir} className="min-w-0 max-w-full">
      <div
        role="region"
        aria-label={view.summary}
        tabIndex={0}
        className="overflow-x-auto rounded-md border border-border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <table dir={view.dir} className={view.scrollsSideways ? "w-full whitespace-nowrap" : "w-full"}>
          <thead>
            <tr className="bg-muted">
              {view.header.map((cell, index) => (
                <th key={index} scope="col" dir={cell.cellDir} className="px-3 py-2 text-start font-medium">
                  {cell.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} dir={cell.cellDir} className="px-3 py-2 text-start">
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.hiddenCount > 0 && (
        <Button type="button" variant="outline" dir="ltr" className="mt-2 transition-none" onClick={onShowAll}>
          {`${view.showAllLabel} (${view.hiddenCount} hidden)`}
        </Button>
      )}
    </div>
  );
}
