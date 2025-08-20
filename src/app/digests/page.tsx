'use client';

import { useState } from 'react';

function Card({ title, description, actionLabel, onClick }: { title: string; description: string; actionLabel: string; onClick: () => void }) {
  return (
    <div style={{
      border: '1px solid #E5E7EB',
      borderRadius: 12,
      padding: 20,
      background: '#fff',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
    }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ color: '#6B7280', marginBottom: 12 }}>{description}</div>
      <button onClick={onClick} style={{
        padding: '10px 14px',
        background: '#111827',
        color: '#fff',
        borderRadius: 8,
        border: 0,
        cursor: 'pointer'
      }}>{actionLabel}</button>
    </div>
  );
}

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
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Дайджесты и задачи</div>
      <div style={{ color: '#6B7280', marginBottom: 20 }}>Сгенерируйте еженедельный дайджест и синхронизируйте задачи в Linear.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card
          title="Синхронизировать задачи в Linear"
          description="Создать/обновить задачи по последнему Weekly Planning. Дубликаты не создаются — описание дополняется."
          actionLabel="Отправить задачи"
          onClick={() => call('/api/linear/sync-weekly')}
        />
        <Card
          title="Сгенерировать дайджест недели"
          description="Создать новую страницу в разделе Дайджесты за текущую неделю. Берем встречи и форкасты только за 7 дней."
          actionLabel="Сформировать дайджест"
          onClick={() => call('/api/cron/generate-digest')}
        />
      </div>
      {status && (
        <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', background: '#F9FAFB', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>{status}</pre>
      )}
    </div>
  );
}


