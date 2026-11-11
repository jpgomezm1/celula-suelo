import { COOKIE_SESION, origen } from "@/lib/auth";

export async function GET(req: Request) {
  return new Response(null, { status: 303, headers: { location: `${origen(req)}/login`, "set-cookie": `${COOKIE_SESION}=; Path=/; Max-Age=0` } });
}
