import type { ReactElement } from "react";
import type { ChartCard } from "../../pomelo/chart-card.js";
import { chartShapes } from "./chart-shapes.js";

const fullTurn = Number((2 * Math.PI).toFixed(2));

function seriesColour(index: number): string {
  return `var(--pomelo-series-${index}, currentColor)`;
}

function pieSlicePath(start: number, end: number, cx: number, cy: number, radius: number): string {
  const top = `${cx} ${cy - radius}`;
  const point = (angle: number) => {
    if (angle === 0 || angle === fullTurn) return top;
    return `${cx + radius * Math.sin(angle)} ${cy - radius * Math.cos(angle)}`;
  };

  // The model rounds angles to hundredths of a radian. Close the full turn
  // at the exact starting point, drawing two arcs for a whole circle.
  if (start === 0 && end === fullTurn) {
    const halfArc = `A ${radius} ${radius} 0 0 1`;
    return `M ${top} ${halfArc} ${cx} ${cy + radius} ${halfArc} ${top} Z`;
  }

  const sweep = (end === fullTurn ? 2 * Math.PI : end) - start;
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${point(start)} A ${radius} ${radius} 0 ${largeArc} 1 ${point(end)} Z`;
}

export function ChartCardView({ card, width, height }: { card: ChartCard; width: number; height: number }) {
  const shapes = chartShapes(card, { width, height });
  let marks: ReactElement[];
  switch (shapes.kind) {
    case "text":
      return <p>{shapes.summary}</p>;
    case "bar":
      marks = shapes.bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          fill={seriesColour(bar.series)}
        />
      ));
      break;
    case "line":
      marks = shapes.lines.map(({ series, points }) => {
        const coordinates = points.map(({ x, y }) => `${x},${y}`).join(" ");
        // A round cap makes the zero-length segment visible for a single value.
        const linePoints = points.length === 1 ? `${coordinates} ${coordinates}` : coordinates;
        return (
          <polyline
            key={series}
            points={linePoints}
            fill="none"
            stroke={seriesColour(series)}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      });
      break;
    case "pie": {
      const radius = Math.min(width, height) / 2;
      marks = shapes.slices.map(({ start, end }, index) => (
        <path key={index} d={pieSlicePath(start, end, width / 2, height / 2, radius)} fill={seriesColour(index)} />
      ));
      break;
    }
  }

  return (
    <svg role="img" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <title>{shapes.summary}</title>
      {marks}
    </svg>
  );
}
