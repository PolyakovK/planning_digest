import { runtimeConfig } from "@/lib/env";

async function gql(query: string, variables?: any) {
  const apiKey = runtimeConfig.linear.apiKey();
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  
  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  }
  
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Linear GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  
  return json.data;
}

const GET_ISSUE_COMMENTS_QUERY = `query GetIssueComments($issueId: String!) {
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

export async function fetchSignedDocumentsFromLinear(daysBack: number = 7): Promise<string[]> {
  try {
    // REV-96 "Подписанные договора" task ID
    const issueId = "c0ba75b6-19fc-49cf-aeba-1a203a4670b3";
    
    const data = await gql(GET_ISSUE_COMMENTS_QUERY, { issueId });
    const comments = data.issue?.comments?.nodes || [];
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const recentDocuments: string[] = [];
    
    for (const comment of comments) {
      const commentDate = new Date(comment.createdAt);
      if (commentDate >= cutoffDate) {
        // Parse document info from comment body
        const lines = comment.body.split('\n');
        const dateMatch = lines[0].match(/(\d{2}\.\d{2}\.\d{4})/);
        
        if (dateMatch) {
          const docDate = dateMatch[1];
          // Extract document details (look for bold text patterns)
          const docLines = lines.filter(line => 
            line.includes('**') && (
              line.includes('ДС') || 
              line.includes('NDA') || 
              line.includes('договор') ||
              line.includes('Лицензи')
            )
          );
          
          for (const docLine of docLines) {
            // Clean up markdown and extract meaningful text
            const cleanDoc = docLine
              .replace(/\*\*/g, '')
              .replace(/^\s*-?\s*/, '')
              .trim();
            
            if (cleanDoc) {
              recentDocuments.push(`${docDate}: ${cleanDoc}`);
            }
          }
        }
      }
    }
    
    return recentDocuments.reverse(); // Most recent first
  } catch (error) {
    console.error("Error fetching signed documents from Linear:", error);
    return [];
  }
}
