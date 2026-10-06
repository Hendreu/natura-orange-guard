import { Fragment } from "react";
import { parseSolution } from "@/lib/solution-content";

export function SolutionContent({ solution }: { readonly solution: string }) {
  const parts = parseSolution(solution);
  const hasText = parts.some((part) => part.text.trim());
  return (
    <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
      {hasText ? parts.map((part, index) => (
        <Fragment key={index}>
          {part.href ? (
            <a
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-foreground underline decoration-primary underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {part.text}
            </a>
          ) : part.text.split("\n").map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </Fragment>
      )) : "Sem solução registrada."}
    </div>
  );
}
