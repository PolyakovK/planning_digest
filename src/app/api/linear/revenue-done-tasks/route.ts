import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

const QUERY = `query GetRevenueDoneTasks($teamId: String!, $after: DateTime!) {
  team(id: $teamId) {
    id
    key
    name
    issues(
      filter: { 
        state: { name: { eq: "Done" } }
        updatedAt: { gte: $after }
      }
      orderBy: updatedAt
      first: 100
    ) {
      nodes {
        id
        identifier
        title
        state { name }
        project { id name }
        assignee { id name }
        createdAt
        updatedAt
        completedAt
      }
    }
  }
}`;

export async function GET() {
  try {
    // Revenue team ID
    const teamId = "3ff6c82d-369a-4296-b903-92251ba52611";
    
    // Last 7 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    
    const apiKey = runtimeConfig.linear.apiKey();
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ 
        query: QUERY, 
        variables: { 
          teamId, 
          after: cutoffDate.toISOString() 
        } 
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
