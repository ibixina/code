import { createMcpAppEnvironmentAtoms } from "@fcode/client-runtime/state/mcp-apps";

import { connectionAtomRuntime } from "../connection/runtime";

export const mcpAppEnvironment = createMcpAppEnvironmentAtoms(connectionAtomRuntime);
