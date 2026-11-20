import type { VersionCompareResult } from "./version-compare.js";

export type PomeloVersionCompareProps = {
  result: VersionCompareResult;
  fromVersion: number;
  toVersion: number;
  onShowFold?: (row: { oldLine: number; newLine: number; count: number }) => void;
};

export function PomeloVersionCompare({ result, fromVersion, toVersion, onShowFold }: PomeloVersionCompareProps) {
  if (result.status === "fallback") return <p>{result.reason}</p>;

  return (
    <section className="min-w-0 space-y-2 text-sm" aria-label={`Compare version ${fromVersion} to version ${toVersion}`}>
      <p className="m-0 font-medium">{result.summary}</p>
      {result.rows.length > 0 && (
        <ul className="m-0 list-none space-y-1 p-0 font-mono" role="list" dir="ltr">
          {result.rows.map((row) => {
            const key = `${row.type}-${row.oldLine ?? ""}-${row.newLine ?? ""}`;
            if (row.type === "fold") {
              const { oldLine, newLine, count } = row;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className="min-h-6 font-sans underline"
                    disabled={!onShowFold}
                    onClick={() => onShowFold?.({ oldLine, newLine, count })}
                  >
                    {`Show ${count} unchanged lines`}
                  </button>
                </li>
              );
            }

            const sign = row.type === "added" ? "+" : row.type === "removed" ? "-" : "";
            return (
              <li key={key} className="grid grid-cols-[1ch_4ch_minmax(0,1fr)] gap-x-2">
                <span aria-hidden="true">{sign}</span>
                {row.type !== "same" && <span className="sr-only">{`${row.type} `}</span>}
                <span className="text-right">{row.newLine ?? row.oldLine}</span>
                <code className="whitespace-pre-wrap text-left font-mono [overflow-wrap:anywhere]" dir="ltr">{row.content}</code>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
