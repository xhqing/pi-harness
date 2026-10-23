import { bedrockProviderModule } from "pi-ai/bedrock-provider";
import { registerBunOAuthFlows } from "pi-ai/bun-oauth";
import { setBedrockProviderModule } from "pi-ai/compat";
import { APP_NAME } from "../config.ts";

process.title = APP_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;
registerBunOAuthFlows();
setBedrockProviderModule(bedrockProviderModule);
