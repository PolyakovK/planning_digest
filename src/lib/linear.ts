import { runtimeConfig } from "@/lib/env";

const ENDPOINT = "https://api.linear.app/graphql";

type LinearIssue = {
  id: string;
  title: string;
  description?: string;
  state: { name: string };
  updatedAt: string;
  createdAt: string;
  history?: Array<{ createdAt: string; toState?: { name: string }; fromState?: { name: string }; body?: string }>;
};

async function gql(query: string, variables: any) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: runtimeConfig.linear.apiKey()
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`Linear HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Linear GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export async function fetchIssuesByTeams(teamIdsCsv: string) {
  const teamIds = teamIdsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const issues: Record<string, LinearIssue[]> = {};
  const query = `query Issues($teamId: String!) {
    team(id: $teamId) {
      id name
      issues(first: 200, includeArchived: false) {
        nodes { id title description state { name } createdAt updatedAt }
      }
    }
  }`;
  for (const teamId of teamIds) {
    const data = await gql(query, { teamId });
    const teamName = data?.team?.name as string;
    const nodes = (data?.team?.issues?.nodes || []) as LinearIssue[];
    issues[teamName] = nodes;
  }
  return issues;
}

export type LinearGrouped = Record<string, { completed: string[]; planned: string[] }>;

export function groupIssuesForDigest(issuesByTeam: Record<string, LinearIssue[]>): LinearGrouped {
  const grouped: LinearGrouped = {};
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  for (const [team, list] of Object.entries(issuesByTeam)) {
    const dep = (grouped[team] = grouped[team] || { completed: [], planned: [] });
    for (const issue of list) {
      const state = issue.state?.name?.toLowerCase() || "";
      if (state === "done" || state === "completed" || state === "closed") {
        const updated = new Date(issue.updatedAt).getTime();
        if (now - updated <= sevenDays) dep.completed.push(formatIssue(issue));
      } else if (["todo", "in progress", "in review", "triage", "backlog"].includes(state)) {
        dep.planned.push(formatIssue(issue));
      }
    }
  }
  return grouped;
}

function formatIssue(issue: LinearIssue): string {
  const title = issue.title?.trim() || "Без названия";
  const desc = (issue.description || "").replace(/\s+/g, " ").trim();
  return desc ? `${title}: ${desc}` : title;
}

export async function fetchTeams(): Promise<Array<{ id: string; name: string }>> {
  const data = await gql(`{ teams(first: 100) { nodes { id name } } }`, {});
  return (data?.teams?.nodes || []) as Array<{ id: string; name: string }>;
}

export async function fetchProjectsByTeamId(teamId: string): Promise<Array<{ id: string; name: string }>> {
  const data = await gql(
    `query($id:String!){ projects(filter:{team:{id:{eq:$id}}}, first:100){ nodes{ id name } } }`,
    { id: teamId }
  );
  return (data?.projects?.nodes || []) as Array<{ id: string; name: string }>;
}

export async function fetchIssuesByProjectId(projectId: string): Promise<LinearIssue[]> {
  const data = await gql(
    `query($id:String!){
      project(id:$id){ id name
        issues(first:200){ nodes{ id title description state{ name } createdAt updatedAt }
        }
      }
    }`,
    { id: projectId }
  );
  return (data?.project?.issues?.nodes || []) as LinearIssue[];
}


