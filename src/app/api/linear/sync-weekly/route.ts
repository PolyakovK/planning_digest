import { extractWeeklyTasks } from "@/lib/summary";
import { createLinearIssue, getTeamIdByProject, findIssueByTitleInProject, updateIssueDescription } from "@/lib/linear";
import { runtimeConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  try {
    const data = await extractWeeklyTasks();
    const projectId = runtimeConfig.linear.projectId();
    const teamId = await getTeamIdByProject(projectId);

    const created: Array<{ id: string; identifier: string; title: string }> = [];
    const updated: Array<{ id: string; identifier: string; title: string }> = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const employee of data.employees) {
      for (const task of employee.tasks) {
        const issue = await createLinearIssue({
          title: `${employee.name}: ${task.title}`,
          description: task.description,
          teamId,
          projectId
        });
        // Before creating, try to find existing by exact title in this project
        const existing = await findIssueByTitleInProject(projectId, `${employee.name}: ${task.title}`);
        if (existing) {
          const base = existing.description ?? "";
          const appended = `${base}\n\n---\nUpdate ${today}: ${task.description ?? "прогресс без описания"}`;
          const res = await updateIssueDescription(existing.id, appended);
          if (res) updated.push(res);
          continue;
        }
        if (issue) created.push(issue);
      }
    }

    return new Response(JSON.stringify({ ok: true, created, updated }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
}


