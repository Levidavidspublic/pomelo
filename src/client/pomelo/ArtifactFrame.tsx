import { artifactFrameProps } from "./artifact-frame.js";

export function ArtifactFrame({ html, title }: { html: string; title: string }) {
  return <iframe className="block w-full border-0" {...artifactFrameProps(html, title)} />;
}
