export default function HomePage() {
  return (
    <div>
      <h1>Planning Digest</h1>
      <p>Сервис готов. Проверь API маршруты:</p>
      <ul>
        <li><code>/api/health</code></li>
        <li><code>/api/cron/generate-digest</code></li>
        <li><code>/api/linear/sync-weekly</code></li>
      </ul>
    </div>
  );
}


