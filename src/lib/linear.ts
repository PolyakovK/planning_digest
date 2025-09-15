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
    
    console.log('DEBUG REV-96: всего комментариев найдено:', comments.length);
    console.log('DEBUG REV-96: идентификатор задачи:', data.issue?.identifier);
    console.log('DEBUG REV-96: название задачи:', data.issue?.title);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    console.log('DEBUG REV-96: cutoff date для фильтрации:', cutoffDate.toISOString());
    
    const recentDocuments: string[] = [];
    
    for (const comment of comments) {
      const commentDate = new Date(comment.createdAt);
      console.log('DEBUG REV-96: обрабатываем комментарий от:', commentDate.toISOString());
      console.log('DEBUG REV-96: комментарий проходит фильтр по дате?', commentDate >= cutoffDate);
      console.log('DEBUG REV-96: содержимое комментария:', comment.body);
      
      if (commentDate >= cutoffDate) {
        // Parse document info from comment body
        const lines = comment.body.split('\n');
        console.log('DEBUG REV-96: комментарий разбит на строки:', lines.length);
        console.log('DEBUG REV-96: первая строка:', lines[0]);
        
        const dateMatch = lines[0].match(/(\d{2}\.\d{2}\.\d{4})/);
        console.log('DEBUG REV-96: найдена дата в первой строке?', !!dateMatch, dateMatch);
        
        if (dateMatch) {
          const docDate = dateMatch[1];
          console.log('DEBUG REV-96: дата документа:', docDate);
          
          // Extract document details (look for bold text patterns)
          const docLines = lines.filter((line: string) => {
            const hasMarkdown = line.includes('**');
            const hasDocKeyword = line.includes('ДС') || 
                                  line.includes('NDA') || 
                                  line.includes('договор') ||
                                  line.includes('Лицензи');
            
            console.log('DEBUG REV-96: анализируем строку:', line);
            console.log('DEBUG REV-96: содержит **?', hasMarkdown);
            console.log('DEBUG REV-96: содержит ключевое слово?', hasDocKeyword);
            
            return hasMarkdown && hasDocKeyword;
          });
          
          console.log('DEBUG REV-96: найдено строк с документами:', docLines.length);
          console.log('DEBUG REV-96: строки с документами:', docLines);
          
          for (const docLine of docLines) {
            // Clean up markdown and extract meaningful text
            const cleanDoc = docLine
              .replace(/\*\*/g, '')
              .replace(/^\s*-?\s*/, '')
              .trim();
            
            console.log('DEBUG REV-96: очищенный документ:', cleanDoc);
            
            if (cleanDoc) {
              const finalDoc = `${docDate}: ${cleanDoc}`;
              console.log('DEBUG REV-96: добавляем документ:', finalDoc);
              recentDocuments.push(finalDoc);
            }
          }
        }
      }
    }
    
    console.log('DEBUG REV-96: итоговый массив документов:', recentDocuments);
    console.log('DEBUG REV-96: количество найденных документов:', recentDocuments.length);
    
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
          first: 100
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

export async function fetchSpecificTask(identifier: string): Promise<any | null> {
  try {
    // Revenue team ID
    const teamId = "3ff6c82d-369a-4296-b903-92251ba52611";
    
    const data = await gql(`query GetSpecificTask($teamId: String!, $identifier: String!) {
      team(id: $teamId) {
        issues(
          filter: { 
            identifier: { eq: $identifier }
          }
          first: 1
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
    }`, { teamId, identifier });
    
    const tasks = data.team?.issues?.nodes || [];
    return tasks.length > 0 ? tasks[0] : null;
  } catch (error) {
    console.error(`Error fetching task ${identifier} from Linear:`, error);
    return null;
  }
}

export async function fetchReceivedPaymentsFromLinear(daysBack: number = 7): Promise<string[]> {
  try {
    // REV-97 "Полученные деньги" task ID
    const issueId = "c1007f05-76b9-40b3-a845-8e57bfc9df24";
    
    const data = await gql(GET_ISSUE_COMMENTS_QUERY, { issueId });
    const comments = data.issue?.comments?.nodes || [];
    
    console.log('DEBUG REV-97: всего комментариев найдено:', comments.length);
    console.log('DEBUG REV-97: идентификатор задачи:', data.issue?.identifier);
    console.log('DEBUG REV-97: название задачи:', data.issue?.title);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    console.log('DEBUG REV-97: cutoff date для фильтрации:', cutoffDate.toISOString());
    
    const recentPayments: string[] = [];
    
    for (const comment of comments) {
      const commentDate = new Date(comment.createdAt);
      console.log('DEBUG REV-97: обрабатываем комментарий от:', commentDate.toISOString());
      console.log('DEBUG REV-97: комментарий проходит фильтр по дате?', commentDate >= cutoffDate);
      console.log('DEBUG REV-97: содержимое комментария:', comment.body);
      
      if (commentDate >= cutoffDate) {
        // Parse payment info from comment body
        const lines = comment.body.split('\n');
        console.log('DEBUG REV-97: комментарий разбит на строки:', lines.length);
        
        // Ищем дату в тексте комментария (может быть в любой строке)
        const fullText = comment.body;
        const dateMatch = fullText.match(/с\s+(\d{1,2})\s+по\s+(\d{1,2})\s+(\w+)/i) || 
                         fullText.match(/(\d{2}\.\d{2}\.\d{4})/) ||
                         fullText.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
        
        console.log('DEBUG REV-97: найдена дата в тексте?', !!dateMatch, dateMatch);
        console.log('DEBUG REV-97: полный текст для поиска даты:', JSON.stringify(fullText));
        
        let paymentPeriod = '';
        if (dateMatch) {
          if (dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            // Формат "с 25 по 29 августа"
            paymentPeriod = `${dateMatch[1]}-${dateMatch[2]} ${dateMatch[3]}`;
          } else {
            // Формат даты
            paymentPeriod = dateMatch[1];
          }
        } else {
          // Если дату не нашли, используем дату создания комментария
          const commentCreated = new Date(comment.createdAt);
          paymentPeriod = commentCreated.toLocaleDateString('ru-RU');
        }
        console.log('DEBUG REV-97: период платежа:', paymentPeriod);
        
        // Ищем строки с платежами (содержат названия компаний и суммы)
        const paymentLines = lines.filter((line: string) => {
          const trimmed = line.trim();
          const hasAmount = /\d+\s*к\b/i.test(trimmed) ||
                           /\d+\s*тыс/i.test(trimmed) ||
                           /\d+[\s,]*руб/i.test(trimmed) ||
                           /\d+[\s,]*млн/i.test(trimmed) ||
                           /₽/.test(trimmed) ||
                           /\d+\s*000/.test(trimmed);
          const hasCompany = (/ООО/.test(trimmed) && /\d+/.test(trimmed)) ||
                            (/компани/i.test(trimmed) && /\d+/.test(trimmed)) ||
                            (/директ/i.test(trimmed) && /\d+/.test(trimmed)) ||
                            (/флаувау/i.test(trimmed) && /\d+/.test(trimmed));
          
          console.log('DEBUG REV-97: анализируем строку:', trimmed);
          console.log('DEBUG REV-97: содержит сумму?', hasAmount);
          console.log('DEBUG REV-97: содержит компанию?', hasCompany);
          console.log('DEBUG REV-97: тест млн:', /\d+[\s,]*млн/i.test(trimmed));
          console.log('DEBUG REV-97: тест руб:', /\d+[\s,]*руб/i.test(trimmed));
          
          return trimmed && (hasAmount || hasCompany);
        });
        
        console.log('DEBUG REV-97: найдено строк с платежами:', paymentLines.length);
        console.log('DEBUG REV-97: строки с платежами:', paymentLines);
        
        for (const paymentLine of paymentLines) {
          // Очищаем строку от лишних символов
          const cleanPayment = paymentLine
            .replace(/^\s*-?\s*/, '') // Убираем тире и пробелы в начале
            .trim();
          
          console.log('DEBUG REV-97: очищенный платеж:', cleanPayment);
          
          if (cleanPayment && cleanPayment.length > 5) { // Минимальная длина для осмысленной записи
            const finalPayment = `${paymentPeriod}: ${cleanPayment}`;
            console.log('DEBUG REV-97: добавляем платеж:', finalPayment);
            recentPayments.push(finalPayment);
          }
        }
      }
    }
    
    console.log('DEBUG REV-97: итоговый массив платежей:', recentPayments);
    console.log('DEBUG REV-97: количество найденных платежей:', recentPayments.length);
    
    return recentPayments.reverse(); // Most recent first
  } catch (error) {
    console.error("Error fetching received payments from Linear:", error);
    return [];
  }
}


