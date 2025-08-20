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
  const query = `query GetProject($id: String!) { project(id: $id) { id name team { id name } } }`;
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
  const teamId = data?.data?.project?.team?.id as string | undefined;
  if (!teamId) throw new Error("Linear: cannot resolve teamId by projectId");
  return teamId;
}


