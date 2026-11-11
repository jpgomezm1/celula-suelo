import { origen } from "@/lib/auth";
import { json, opciones } from "@/lib/oauth";

export function GET(req: Request) {
  const b = origen(req);
  return json({ resource: `${b}/api/mcp`, authorization_servers: [b], scopes_supported: ["mcp"], bearer_methods_supported: ["header"], resource_name: "Inteligencia de suelo" });
}
export const OPTIONS = opciones;
