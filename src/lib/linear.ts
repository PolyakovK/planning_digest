import { runtimeConfig } from "@/lib/env";

const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

type LinearIssueInput = {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
};

export async function createLinearIssue(input: LinearIssueInput) {
  const mutation = `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }`;
  const variables = {
    input: {
      title: input.title,
      description: input.description ?? "",
      teamId: input.teamId,
      projectId: input.projectId
    }
  };

  const res = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: runtimeConfig.linear.apiKey()
    },
    body: JSON.stringify({ query: mutation, variables })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.data?.issueCreate?.issue;
}

export async function getTeamIdByProject(projectId: string): Promise<string> {
  const query = `query GetProject($id: String!) { project(id: $id) { id name teams(first: 1) { nodes { id name } } } }`;
  const res = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: runtimeConfig.linear.apiKey()
    },
    body: JSON.stringify({ query, variables: { id: projectId } })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const teamId = data?.data?.project?.teams?.nodes?.[0]?.id as string | undefined;
  if (!teamId) throw new Error("Linear: cannot resolve teamId by projectId (no teams attached)");
  return teamId;
}

export async function findIssueByTitleInProject(projectId: string, title: string) {
  const query = `query IssuesByTitle($projectId: ID!, $title: String!) {
    issues(filter: { project: { id: { eq: $projectId } }, title: { eq: $title } }, first: 1) {
      nodes { id identifier title description }
    }
  }`;
  const res = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: runtimeConfig.linear.apiKey()
    },
    body: JSON.stringify({ query, variables: { projectId, title } })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.data?.issues?.nodes?.[0] ?? null;
}

export async function updateIssueDescription(issueId: string, description: string) {
  const mutation = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) { success issue { id identifier title description } }
  }`;
  const variables = { id: issueId, input: { description } };
  const res = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: runtimeConfig.linear.apiKey()
    },
    body: JSON.stringify({ query: mutation, variables })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.data?.issueUpdate?.issue;
}

export async function resolveProjectIdFromEnv(): Promise<string> {
  const raw = runtimeConfig.linear.projectId();
  // If it's a URL, try to extract slugId from last dash segment
  let slugId: string | null = null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const last = url.pathname.split("/").filter(Boolean).pop() || "";
      const parts = last.split("-");
      slugId = parts[parts.length - 1] || null;
    } catch {}
  } else if (/^[a-f0-9]{12}$/i.test(raw)) {
    slugId = raw;
  }

  if (slugId) {
    const query = `query ProjectBySlug($slugId: String!) { projects(filter: { slugId: { eq: $slugId } }, first: 1) { nodes { id } } }`;
    const res = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: runtimeConfig.linear.apiKey()
      },
      body: JSON.stringify({ query, variables: { slugId } })
    });
    if (!res.ok) throw new Error(`Linear error resolving project by slugId: ${res.status}`);
    const data = await res.json();
    const id = data?.data?.projects?.nodes?.[0]?.id as string | undefined;
    if (!id) throw new Error("Linear: project not found by slugId");
    return id;
  }

  // Fallback: assume provided value is project ID
  return raw;
}


