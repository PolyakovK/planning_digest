import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

const QUERY = `query GetIssueComments($issueId: String!) {
  issue(id: $issueId) {
    id
    identifier
    title
    state { name }
    comments {
      nodes {
        id
        body
        createdAt
        updatedAt
        user {
          id
          name
          email
        }
      }
    }
  }
}`;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("issueId");
    
    if (!issueId) {
      return new Response(JSON.stringify({ error: "issueId parameter is required" }), { status: 400 });
    }

    const apiKey = runtimeConfig.linear.apiKey();
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ 
        query: QUERY, 
        variables: { issueId } 
      }),
    });
    
    const json = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify(json), { status: res.status });
    }
    
    return new Response(JSON.stringify(json), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
  }
}
