import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

const QUERY = `query ViewerTeamsProjectsIssues($first:Int!) {
  viewer { id name email }
  teams(first: 50) { nodes { id key name } }
  projects(first: 50) { nodes { id name slug url } }
  issues(orderBy: updatedAt, first: $first) {
    nodes {
      id
      identifier
      title
      state { name }
      team { id key name }
      project { id name }
      assignee { id name }
      createdAt
      updatedAt
    }
  }
}`;

export async function GET() {
  try {
    const apiKey = runtimeConfig.linear.apiKey();
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: QUERY, variables: { first: 20 } }),
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


