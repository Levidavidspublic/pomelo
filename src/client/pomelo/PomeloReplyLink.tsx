import type { replyLink } from "./reply-link.js";
import { textDirection } from "./text-direction.js";

type PomeloReplyLinkProps = { link: ReturnType<typeof replyLink> };

export function PomeloReplyLink({ link }: PomeloReplyLinkProps) {
  const label = <bdi dir={textDirection(link.text)}>{link.text}</bdi>;

  switch (link.mode) {
    case "text":
      return (
        <span title={link.reason}>
          {label}
          <span className="sr-only"> {link.reason}</span>
        </span>
      );

    case "link":
    case "inApp":
      return (
        <span>
          <a
            className="underline"
            href={link.href}
            target={link.mode === "link" ? link.target : undefined}
            rel={link.mode === "link" ? link.rel : undefined}
          >
            {label}
          </a>
          {(link.host || link.mismatch) && (
            <>
              {" "}
              <bdi dir="ltr" className="text-muted-foreground">
                {link.mismatch && "Link text names a different site. Destination is "}
                {link.host}
              </bdi>
            </>
          )}
        </span>
      );
  }
}
