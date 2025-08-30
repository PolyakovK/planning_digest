'use client';

import { useState, useEffect } from 'react';

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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [timer, setTimer] = useState<number>(0);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  async function call(path: string) {
    setIsLoading(true);
    setTimer(0);
    setShowSuccess(false);
    setStatus("Выполняю...");
    
    const startTime = Date.now();
    const res = await fetch(path, { method: 'POST' });
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    setIsLoading(false);
    
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus(`Готово за ${formatTime(duration)}!`);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } else {
      setStatus(`Ошибка: ${json?.error || res.status}`);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Дайджесты</div>
      <div style={{ color: '#6B7280', marginBottom: 20 }}>Автоматическая генерация еженедельного дайджеста с данными из Linear и финансовыми результатами.</div>
      
      {/* Подробное описание процесса */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#1E293B' }}>🔄 Что происходит при генерации дайджеста:</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
          <div style={{ marginBottom: 8 }}><strong>1. 💰 Финансовые результаты</strong> - сбор подписанных документов и платежей из Linear (задачи REV-96, REV-97)</div>
          <div style={{ marginBottom: 8 }}><strong>2. 🎯 Итоги и фокус недели</strong> - анализ выполненных и активных задач команды Revenue через GPT-4o</div>
          <div style={{ marginBottom: 8 }}><strong>3. 📋 Планы по отделам</strong> - группировка задач по 9 проектам с детальным форматированием каждой задачи</div>
          <div style={{ marginBottom: 8 }}><strong>4. 📅 Встречи</strong> - сбор встреч за последние 7 дней из Notion с извлечением Executive Summary</div>
          <div><strong>5. 📝 Создание страницы</strong> - формирование итогового дайджеста в Notion с двухколоночной структурой</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <Card
          title="Сгенерировать еженедельный дайджест"
          description="Создать полный дайджест с финансовыми результатами, итогами и планами по отделам на основе данных из Linear."
          actionLabel="Создать"
          onClick={() => call('/api/cron/generate-digest')}
        />
      </div>
      
      {/* Статус с таймером и анимацией */}
      {status && (
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          background: showSuccess ? '#F0FDF4' : '#F9FAFB', 
          borderRadius: 8, 
          border: `1px solid ${showSuccess ? '#BBF7D0' : '#E5E7EB'}`,
          position: 'relative',
          overflow: 'hidden'
        }}>
          {showSuccess && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(45deg, transparent 30%, rgba(34, 197, 94, 0.1) 50%, transparent 70%)',
              animation: 'shimmer 2s ease-in-out'
            }} />
          )}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            position: 'relative',
            zIndex: 1
          }}>
            {isLoading && (
              <div style={{
                width: 16,
                height: 16,
                border: '2px solid #E5E7EB',
                borderTop: '2px solid #3B82F6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {showSuccess && (
              <div style={{
                width: 16,
                height: 16,
                background: '#22C55E',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 10,
                fontWeight: 'bold'
              }}>✓</div>
            )}
            <span style={{ 
              fontFamily: 'monospace', 
              color: showSuccess ? '#15803D' : '#374151',
              fontWeight: showSuccess ? 600 : 400
            }}>
              {isLoading ? `${status} ${formatTime(timer)}` : status}
            </span>
          </div>
          {showSuccess && (
            <div style={{
              position: 'absolute',
              top: '50%',
              right: 20,
              transform: 'translateY(-50%)',
              fontSize: 20,
              animation: 'bounce 1s ease-in-out 3'
            }}>🎉</div>
          )}
        </div>
      )}
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(-50%); }
          40% { transform: translateY(-60%); }
          60% { transform: translateY(-55%); }
        }
      `}</style>
    </div>
  );
}


