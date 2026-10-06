import { strictEqual } from "node:assert";
import { test } from "node:test";

import { displayQidTitle } from "./qid-metadata";

test("uses the presentation fallback when a QID title is blank", () => {
  strictEqual(displayQidTitle(null), "Sem título");
  strictEqual(displayQidTitle(undefined), "Sem título");
  strictEqual(displayQidTitle(""), "Sem título");
  strictEqual(displayQidTitle("   \t"), "Sem título");
  strictEqual(displayQidTitle("  Título real  "), "Título real");
});
