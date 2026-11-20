import { Button } from "../components/ui/button.js";
import { textDirection } from "./text-direction.js";

export type PomeloHeldJobCardProps = {
  card: {
    kind: string;
    title: string;
    note?: string;
    approve?: string;
    options?: readonly { label: string }[];
    columns?: readonly string[];
    rows?: readonly (readonly string[])[];
  };
  onAnswer: (label: string) => void;
};

export function PomeloHeldJobCard({ card, onAnswer }: PomeloHeldJobCardProps) {
  const { kind, title, note, approve, options, columns = [], rows = [] } = card;
  let answers: string[] = [];
  if (kind === "goahead" && approve) answers = [approve];
  if (kind === "choices" && options) answers = options.map(({ label }) => label);

  return (
    <div
      role="group"
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground"
    >
      <div className="space-y-1">
        <p role="status" className="m-0 text-sm text-muted-foreground">waiting for you</p>
        <p dir={textDirection(title)} className="m-0 font-semibold [overflow-wrap:anywhere]">{title}</p>
        {note && <p dir={textDirection(note)} className="m-0 text-sm [overflow-wrap:anywhere]">{note}</p>}
      </div>
      {kind === "table" && columns.length > 0 && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" dir={textDirection(column)} className="px-2 py-1 text-start font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} dir={textDirection(cell)} className="px-2 py-1 text-start [overflow-wrap:anywhere]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {answers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {answers.map((label) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              dir={textDirection(label)}
              className="transition-none"
              onClick={() => onAnswer(label)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
