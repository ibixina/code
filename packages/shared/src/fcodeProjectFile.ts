import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { FcodeProjectFile, FCODE_PROJECT_FILE_SCHEMA_URL } from "@fcode/contracts";

import { fromLenientJson } from "./schemaJson.ts";

export const FcodeProjectFileFromJson = fromLenientJson(FcodeProjectFile);

const decodeFcodeProjectFile = Schema.decodeExit(FcodeProjectFileFromJson);

export function parseFcodeProjectFile(contents: string): FcodeProjectFile | null {
  const decoded = decodeFcodeProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

export function buildFcodeProjectFileJsonSchema(): Record<string, unknown> {
  const document = Schema.toJsonSchemaDocument(FcodeProjectFile, { onExcessProperty: "error" });
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: FCODE_PROJECT_FILE_SCHEMA_URL,
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
