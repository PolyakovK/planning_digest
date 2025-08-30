import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

const QUERY = `query GetRevenueDoneTasks($teamId: String!) {
  team(id: $teamId) {
    id
    key
    name
    issues(
      filter: { 
        state: { name: { eq: "Done" } }
      }
      orderBy: updatedAt
      first: 20
    ) {
      nodes {
        id
        identifier
        title
        description
        state { name }
        project { id name }
        assignee { id name }
        createdAt
        updatedAt
        completedAt
        comments {
          nodes {
            id
            body
            createdAt
            user {
              id
              name
            }
          }
        }
      }
    }
  }
}`;

export async function GET() {
  try {
    // Revenue team ID
    const teamId = "3ff6c82d-369a-4296-b903-92251ba52611";
    
    const apiKey = runtimeConfig.linear.apiKey();
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ 
        query: QUERY, 
        variables: { teamId } 
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
