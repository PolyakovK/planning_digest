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
    comments(orderBy: createdAt, last: 10) {
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
          const docLines = lines.filter((line: string) => 
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

export async function fetchDoneTasksFromLinear(): Promise<any[]> {
  try {
    // Revenue team ID
    const teamId = "3ff6c82d-369a-4296-b903-92251ba52611";
    
    const data = await gql(`query GetRevenueDoneTasks($teamId: String!) {
      team(id: $teamId) {
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
            comments(orderBy: createdAt, last: 10) {
              nodes {
                id
                body
                createdAt
                user { name }
              }
            }
          }
        }
      }
    }`, { teamId });
    
    return data.team?.issues?.nodes || [];
  } catch (error) {
    console.error("Error fetching done tasks from Linear:", error);
    return [];
  }
}

export async function fetchAllRevenueProjects(): Promise<string[]> {
  try {
    // Revenue team ID
    const teamId = "3ff6c82d-369a-4296-b903-92251ba52611";
    
    const data = await gql(`query GetRevenueProjects($teamId: String!) {
      team(id: $teamId) {
        projects(first: 50) {
          nodes {
            id
            name
          }
        }
      }
    }`, { teamId });
    
    const projects = data.team?.projects?.nodes || [];
    return projects.map((project: any) => project.name).sort();
  } catch (error) {
    console.error("Error fetching Revenue projects:", error);
    return [];
  }
}

export async function fetchActiveTasksFromLinear(): Promise<any[]> {
  try {
    // Revenue team ID
    const teamId = "3ff6c82d-369a-4296-b903-92251ba52611";
    
    const data = await gql(`query GetRevenueActiveTasks($teamId: String!) {
      team(id: $teamId) {
        issues(
          filter: { 
            state: { 
              name: { 
                in: ["Todo", "In Progress", "In Review"] 
              } 
            }
          }
          orderBy: updatedAt
          first: 50
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
            comments(orderBy: createdAt, last: 10) {
              nodes {
                id
                body
                createdAt
                user { name }
              }
            }
          }
        }
      }
    }`, { teamId });
    
    return data.team?.issues?.nodes || [];
  } catch (error) {
    console.error("Error fetching active tasks from Linear:", error);
    return [];
  }
}

export function groupTasksByProject(tasks: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  
  for (const task of tasks) {
    const projectName = task.project?.name || 'Без проекта';
    if (!grouped[projectName]) {
      grouped[projectName] = [];
    }
    grouped[projectName].push(task);
  }
  
  return grouped;
}

export async function fetchReceivedPaymentsFromLinear(daysBack: number = 7): Promise<string[]> {
  try {
    // REV-97 "Полученные деньги" task ID
    const issueId = "c1007f05-76b9-40b3-a845-8e57bfc9df24";
    
    const data = await gql(GET_ISSUE_COMMENTS_QUERY, { issueId });
    const comments = data.issue?.comments?.nodes || [];
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const recentPayments: string[] = [];
    
    for (const comment of comments) {
      const commentDate = new Date(comment.createdAt);
      if (commentDate >= cutoffDate) {
        // Parse payment info from comment body
        const lines = comment.body.split('\n');
        const dateMatch = lines[0].match(/(\d{2}\.\d{2}\.\d{4})/);
        
        if (dateMatch) {
          const paymentDate = dateMatch[1];
          // Extract payment details (look for bold text patterns or amounts)
          const paymentLines = lines.filter((line: string) => 
            line.includes('**') && (
              line.includes('руб') || 
              line.includes('₽') || 
              line.includes('оплат') ||
              line.includes('поступ') ||
              line.includes('получ') ||
              /\d+\s*000/.test(line) // Numbers with thousands
            )
          );
          
          for (const paymentLine of paymentLines) {
            // Clean up markdown and extract meaningful text
            const cleanPayment = paymentLine
              .replace(/\*\*/g, '')
              .replace(/^\s*-?\s*/, '')
              .trim();
            
            if (cleanPayment) {
              recentPayments.push(`${paymentDate}: ${cleanPayment}`);
            }
          }
        }
      }
    }
    
    return recentPayments.reverse(); // Most recent first
  } catch (error) {
    console.error("Error fetching received payments from Linear:", error);
    return [];
  }
}


