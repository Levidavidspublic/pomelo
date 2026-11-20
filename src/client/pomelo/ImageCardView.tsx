import { useState } from "react";
import { imageFrame, type ImageFrameCard, type ImageFrameSurface, type ImageLoadState } from "./image-frame.js";
import { checkImageSource, type ImageSourceCard } from "./image-source.js";

type ImageCardViewProps = {
  card: ImageSourceCard & ImageFrameCard;
  where: ImageFrameSurface;
  initialState?: ImageLoadState;
};

function LocalImageFrame({ card, src, where, initialState }: ImageCardViewProps & { src: string }) {
  const [state, setState] = useState(initialState ?? "loading");
  const frame = imageFrame(card, state, where);
  const { aspectRatio, maxHeight } = frame.box;

  return (
    <div
      className="relative w-full rounded-xl bg-muted"
      style={{ aspectRatio, maxHeight: maxHeight ?? undefined, maxWidth: maxHeight === null ? undefined : maxHeight * aspectRatio }}
    >
      {frame.state === "failed" ? (
        <p className="m-0 p-2 text-sm text-muted-foreground">{frame.note}</p>
      ) : (
        <img
          className="absolute inset-0 h-full w-full rounded-xl object-contain"
          src={src}
          alt={frame.alt}
          loading="lazy"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      )}
    </div>
  );
}

export function ImageCardView({ card, where, initialState }: ImageCardViewProps) {
  const source = checkImageSource(card);
  if (source.mode === "refuse") {
    return <p className="m-0 text-sm text-muted-foreground">{source.reason}</p>;
  }
  if (source.mode === "link") {
    const { alt } = imageFrame(card, initialState ?? "loading", where);
    return (
      <a className="underline" dir="auto" href={source.href} rel="noreferrer noopener" target="_blank">
        {alt}
      </a>
    );
  }
  return <LocalImageFrame key={source.src} src={source.src} card={card} where={where} initialState={initialState} />;
}
