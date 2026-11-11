import { origen } from "@/lib/auth";
import { json, opciones } from "@/lib/oauth";

export function GET(req: Request) {
  const b = origen(req);
  return json({
    issuer: b,
    authorization_endpoint: `${b}/oauth/authorize`,
    token_endpoint: `${b}/api/oauth/token`,
    registration_endpoint: `${b}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}
export const OPTIONS = opciones;
