import { extractWeeklyTasks } from "@/lib/summary";
import { createLinearIssue, getTeamIdByProject } from "@/lib/linear";
import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  try {
    const data = await extractWeeklyTasks();
    const projectId = runtimeConfig.linear.projectId();
    const teamId = await getTeamIdByProject(projectId);

    const created: Array<{ id: string; identifier: string; title: string }> = [];
    for (const employee of data.employees) {
      for (const task of employee.tasks) {
        const issue = await createLinearIssue({
          title: `${employee.name}: ${task.title}`,
          description: task.description,
          teamId,
          projectId
        });
        if (issue) created.push(issue);
      }
    }

    return new Response(JSON.stringify({ ok: true, created }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


