import type { APIRoute } from "astro";

import { buildFcodeProjectFileJsonSchema as buildT3ProjectFileJsonSchema } from "@fcode/shared/fcodeProjectFile";

export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildT3ProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
