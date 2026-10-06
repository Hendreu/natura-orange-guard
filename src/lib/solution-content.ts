export type SolutionPart = {
  readonly text: string;
  readonly href: string | null;
};

const namedEntities: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  copy: "\u00a9", reg: "\u00ae", trade: "\u2122", bull: "\u2022",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  laquo: "\u00ab", raquo: "\u00bb", ensp: "\u2002", emsp: "\u2003",
  thinsp: "\u2009", euro: "\u20ac", pound: "\u00a3", yen: "\u00a5",
  cent: "\u00a2", deg: "\u00b0", plusmn: "\u00b1", times: "\u00d7",
  divide: "\u00f7", middot: "\u00b7", shy: "\u00ad",
};

const accentedEntities: Readonly<Record<string, string>> = {
  agrave: "\u00e0", aacute: "\u00e1", acirc: "\u00e2", atilde: "\u00e3", auml: "\u00e4", aring: "\u00e5",
  aelig: "\u00e6", ccedil: "\u00e7", egrave: "\u00e8", eacute: "\u00e9", ecirc: "\u00ea", euml: "\u00eb",
  igrave: "\u00ec", iacute: "\u00ed", icirc: "\u00ee", iuml: "\u00ef", ntilde: "\u00f1",
  ograve: "\u00f2", oacute: "\u00f3", ocirc: "\u00f4", otilde: "\u00f5", ouml: "\u00f6", oslash: "\u00f8",
  ugrave: "\u00f9", uacute: "\u00fa", ucirc: "\u00fb", uuml: "\u00fc", yacute: "\u00fd", yuml: "\u00ff",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]*);/gi, (source: string, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : "\ufffd";
    }
    const accent = accentedEntities[entity.toLowerCase()];
    if (accent) return entity[0] === entity[0]?.toUpperCase() ? accent.toUpperCase() : accent;
    return namedEntities[entity.toLowerCase()] ?? source;
  });
}

function patchHref(attributes: string): string | null {
  for (const attr of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    if (attr[1]?.toLowerCase() !== "href") continue;
    const href = decodeEntities(attr[2] ?? attr[3] ?? attr[4] ?? "").trim();
    if (!/^https?:\/\//i.test(href)) return null;
    try {
      const url = new URL(href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch (error) {
      if (error instanceof TypeError) return null;
      throw error;
    }
  }
  return null;
}

export function parseSolution(solution: string): readonly SolutionPart[] {
  const parts: SolutionPart[] = [];
  let href: string | null = null;
  let suppressedTag: string | null = null;
  let offset = 0;
  const tags = /<!--[\s\S]*?(?:-->|$)|<\/?[a-z](?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  for (const token of solution.matchAll(tags)) {
    if (!suppressedTag && token.index > offset) {
      parts.push({ text: decodeEntities(solution.slice(offset, token.index)), href });
    }
    offset = token.index + token[0].length;
    const tag = /^<(\/)?([a-z][\da-z]*)\b([\s\S]*?)>$/i.exec(token[0]);
    if (!tag) continue;
    const name = tag[2]?.toLowerCase();
    const closing = Boolean(tag[1]);
    if (suppressedTag) {
      if (closing && name === suppressedTag) suppressedTag = null;
      continue;
    }
    if (name === "script" || name === "style") {
      if (!closing) suppressedTag = name;
    } else if (name === "br" || name === "p") {
      parts.push({ text: name === "p" ? "\n\n" : "\n", href: null });
    } else if (name === "a") {
      href = closing ? null : patchHref(tag[3] ?? "");
    }
  }
  if (!suppressedTag && offset < solution.length) {
    parts.push({ text: decodeEntities(solution.slice(offset)), href });
  }
  return parts;
}
