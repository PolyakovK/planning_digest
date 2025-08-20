'use client';

import { useState } from 'react';

export default function DigestsPage() {
  const [status, setStatus] = useState<string>("");

  async function call(path: string) {
    setStatus("Выполняю...");
    const res = await fetch(path, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setStatus(`Готово: ${JSON.stringify(json)}`);
    else setStatus(`Ошибка: ${json?.error || res.status}`);
  }

  return (
    <div>
      <h1>Дайджесты</h1>
      <p>Управление дайджестами и задачами.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={() => call('/api/linear/sync-weekly')}>Отправить задачи в Linear (последний Weekly)</button>
        <button onClick={() => call('/api/cron/generate-digest')}>Сгенерировать новый дайджест недели</button>
      </div>
      {status && (
        <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{status}</pre>
      )}
    </div>
  );
}


