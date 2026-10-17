import { parse } from "acorn";
import { GeneratedToolSchema } from "../agent/schemas";
import { AgentError } from "../agent/provider";
import type { GeneratedTool } from "../agent/types";
import type { PolicyDecision } from "../policy/policy";

export const MAX_GENERATED_TOOLS = 3;
export const MAX_TOOL_RETRIES = 2;
export const MAX_COMMAND_SECONDS = 20;
export const MAX_SOURCE_BYTES = 16_000;

// Parsing never executes source. CreateOS is the isolation boundary.
type Ast = { type: string; [key: string]: unknown };
const allowed = new Set(["Program", "VariableDeclaration", "VariableDeclarator", "Identifier", "Literal", "ExpressionStatement", "CallExpression", "MemberExpression", "AwaitExpression", "ObjectExpression", "Property", "ArrayExpression", "BinaryExpression", "LogicalExpression", "ConditionalExpression", "UnaryExpression", "TemplateLiteral", "TemplateElement"]);
const forbidden = new Set(["constructor", "prototype", "__proto__", "__defineGetter__", "__lookupGetter__", "process", "require", "global", "globalThis", "eval", "Function", "import", "fetch", "WebAssembly", "setTimeout", "setInterval"]);
const fail = (message: string): never => { throw new AgentError("TOOL_REJECTED", message); };

export function validateToolSource(input: unknown): { tool: GeneratedTool; checks: string[] } {
  const tool = GeneratedToolSchema.parse(input);
  if (Buffer.byteLength(tool.source, "utf8") > MAX_SOURCE_BYTES) fail("Generated source exceeds 16000 UTF-8 bytes.");
  if (tool.language !== "javascript") fail("Only the restricted JavaScript diagnostic format is supported.");
  let ast: Ast;
  try { ast = parse(tool.source, { ecmaVersion: 2022, sourceType: "module" }) as unknown as Ast; }
  catch { throw new AgentError("TOOL_SYNTAX", "Generated JavaScript failed syntax validation."); }
  let nodes = 0;
  const calls = { readConfig: 0, probe: 0, log: 0 };
  const probes = new Set<string>();
  function walk(node: Ast) {
    if (++nodes > 1500 || !allowed.has(node.type)) fail(`Unsupported or dangerous syntax: ${node.type}.`);
    if (node.type === "Identifier" && forbidden.has(String(node.name))) fail("A dangerous identifier was rejected.");
    if (node.type === "VariableDeclaration" && node.kind !== "const") fail("Only immutable const declarations are allowed.");
    if (node.type === "VariableDeclarator") {
      const id = node.id as Ast;
      if (id.type !== "Identifier" || ["readConfig", "probe", "console", "JSON"].includes(String(id.name))) fail("Capability shadowing and destructuring are prohibited.");
    }
    if (node.type === "MemberExpression") {
      const property = node.property as Ast;
      if (node.computed || node.optional || property.type !== "Identifier" || forbidden.has(String(property.name))) fail("Computed, optional, or dangerous property access is prohibited.");
    }
    if (node.type === "Property" && (node.computed || node.method || node.kind !== "init")) fail("Only plain data properties are allowed.");
    if (node.type === "Literal" && (node.regex || typeof node.value === "bigint")) fail("Regex and bigint literals are unavailable.");
    if (node.type === "UnaryExpression" && !["!", "+", "-", "typeof"].includes(String(node.operator))) fail("This unary operation is unavailable.");
    if (node.type === "CallExpression") {
      const callee = node.callee as Ast;
      const args = node.arguments as Ast[];
      if (node.optional) fail("Optional calls are unavailable.");
      if (callee.type === "Identifier" && callee.name === "readConfig" && args.length === 0) calls.readConfig++;
      else if (callee.type === "Identifier" && callee.name === "probe" && args.length === 1 && args[0].type === "Literal" && ["proxy", "backend", "configuredUpstream"].includes(String(args[0].value))) {
        if (probes.has(String(args[0].value))) fail("Each fixture endpoint may be probed only once.");
        probes.add(String(args[0].value)); calls.probe++;
      } else if (callee.type === "MemberExpression" && (callee.object as Ast).type === "Identifier" && !callee.computed) {
        const name = `${(callee.object as Ast).name}.${(callee.property as Ast).name}`;
        if (name === "console.log" && args.length === 1) calls.log++;
        else if (name !== "JSON.stringify" || args.length !== 1) fail("Only fixture capabilities and JSON output calls are allowed.");
      } else fail("Arbitrary function calls are prohibited.");
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child && typeof child === "object" && "type" in child) walk(child as Ast); }
      else if (value && typeof value === "object" && "type" in value) walk(value as Ast);
    }
  }
  walk(ast);
  if (calls.readConfig !== 1 || calls.probe !== 3 || calls.log !== 1) fail("Read config once, probe all three endpoints once, and print one JSON observation.");
  return { tool, checks: ["ZOD_VALID", "SOURCE_SIZE_OK", "SYNTAX_OK", "DANGEROUS_OPERATIONS_BLOCKED"] };
}

export function evaluateToolPolicy(tool: GeneratedTool): PolicyDecision {
  if (tool.risk !== "READ_ONLY" || tool.language !== "javascript" || tool.entrypoint !== "/workspace/generated-tool.js" || tool.expectedOutput !== "json" || tool.timeoutSeconds > MAX_COMMAND_SECONDS) {
    return { decision: "DENY", reason: "Only READ_ONLY JSON diagnostics at the fixed JavaScript entrypoint may execute for at most 20 seconds." };
  }
  return { decision: "ALLOW", reason: "Validated read-only fixture capabilities; execution restricted to a disposable CreateOS sandbox." };
}
