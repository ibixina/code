import { makeSecretProviderDefinitionRegistry } from "@fcode/secret-provider-core/shared/definition";
import * as OnePassword from "@fcode/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
