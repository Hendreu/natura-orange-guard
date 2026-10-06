import { doesNotMatch, match } from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SolutionContent } from "./SolutionContent";

describe("SolutionContent", () => {
  it("renders readable breaks and safe patch links when Qualys supplies uppercase HTML", () => {
    const solution = 'Customers are advised to install updates.<BR><A HREF="https://support.microsoft.com/en-in/help/5122878" TARGET="_blank">KB5122878</A><BR><P>Patch:<BR><P><A HREF="https://support.microsoft.com/help/5124012">KB5124012</A>';

    const html = renderToStaticMarkup(<SolutionContent solution={solution} />);

    match(html, /Customers are advised to install updates\.<br\s*\/>/);
    match(html, /href="https:\/\/support\.microsoft\.com\/en-in\/help\/5122878"[^>]*>KB5122878<\/a>/);
    match(html, /rel="noopener noreferrer"/);
    match(html, /target="_blank"/);
    match(html, /Patch:<br\s*\/>/);
    match(html, />KB5124012<\/a>/);
    doesNotMatch(html, /&lt;(?:BR|A|P)/);
  });

  it("preserves original language and line breaks when the solution is plain text", () => {
    const solution = "Instale a atualização.\nReinicie o equipamento.";

    const html = renderToStaticMarkup(<SolutionContent solution={solution} />);

    match(html, /Instale a atualização\.(?:\n|<br\s*\/>)Reinicie o equipamento\./);
  });

  it("decodes entities as text instead of interpreting decoded markup", () => {
    const solution = "A &amp; B &lt;script&gt;safe&lt;/script&gt; &quot;update&quot; &#39;patch&#39; &#xE7; &nbsp; &eacute;";

    const html = renderToStaticMarkup(<SolutionContent solution={solution} />);

    match(html, /A &amp; B &lt;script&gt;safe&lt;\/script&gt; &quot;update&quot; &#x27;patch&#x27; ç \u00a0 é/);
    doesNotMatch(html, /<script/);
  });

  it("excludes script/style content and source event attributes while retaining useful labels", () => {
    const solution = '<ScRiPt>alert(1)</ScRiPt><STYLE>body{display:none}</STYLE><img src=x onerror="alert(2)"><b>Install</b> <a href="https://example.com/patch?a=1&amp;b=2" onclick="alert(3)">Patch</a>';

    const html = renderToStaticMarkup(<SolutionContent solution={solution} />);

    match(html, /Install /);
    match(html, /href="https:\/\/example\.com\/patch\?a=1&amp;b=2"/);
    match(html, />Patch<\/a>/);
    doesNotMatch(html, /alert|display:none|onerror|onclick|<img|<style|<script/i);
  });

  for (const href of ["javascript:alert(1)", "data:text/html,boom", "vbscript:evil", "java&#x73;cript:evil", "//evil.example", "https://"]) {
    it(`keeps the readable label without a link when the URL is unsafe: ${href}`, () => {
      const solution = `<A HREF="${href}">Readable patch</A>`;

      const html = renderToStaticMarkup(<SolutionContent solution={solution} />);

      match(html, /Readable patch/);
      doesNotMatch(html, /<a\b|href=/);
    });
  }

  it("shows the existing empty state when no readable solution remains", () => {
    const solution = "<script>hidden</script><P> &nbsp; </P>";

    const html = renderToStaticMarkup(<SolutionContent solution={solution} />);

    match(html, /Sem solução registrada\./);
  });

  it("shows the existing empty state when the solution is empty", () => {
    const solution = "";

    const html = renderToStaticMarkup(<SolutionContent solution={solution} />);

    match(html, /Sem solução registrada\./);
  });
});
