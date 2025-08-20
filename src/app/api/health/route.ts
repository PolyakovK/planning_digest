export const runtime = "edge";

export async function GET() {
  const body = JSON.stringify({ status: "ok" });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}


