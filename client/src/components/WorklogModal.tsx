import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Activity, WorklogEntry } from '../types.js';
import { PersonAvatar } from './PersonAvatar.js';
import { formatHoursMinutes, formatShort } from './TimelineView.js';

interface PersonGroup {
  author: string;
  totalHours: number;
  entries: WorklogEntry[];
}

/** Agrupa os apontamentos por autor (ordenado por total de horas, maior primeiro), com os
 * apontamentos de cada um ordenados por data. */
export function groupByAuthor(entries: WorklogEntry[]): PersonGroup[] {
  const byAuthor = new Map<string, WorklogEntry[]>();
  for (const entry of entries) {
    const list = byAuthor.get(entry.author) ?? [];
    list.push(entry);
    byAuthor.set(entry.author, list);
  }
  return [...byAuthor.entries()]
    .map(([author, authorEntries]) => ({
      author,
      totalHours: authorEntries.reduce((sum, e) => sum + e.hours, 0),
      entries: [...authorEntries].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

export default function WorklogModal({
  activity,
  title,
  entries,
  avatarUrlByPerson,
  onClose,
}: {
  activity: Activity;
  title: string;
  entries: WorklogEntry[];
  avatarUrlByPerson: Record<string, string | null>;
  onClose: () => void;
}) {
  const groups = groupByAuthor(entries);
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set());
  function toggleAuthor(author: string) {
    setExpandedAuthors((prev) => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  }
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 28,
          width: 760,
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: '80vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          ✕
        </button>
        <div>
          <h2 style={{ fontSize: 16, margin: 0, paddingRight: 24 }}>Apontamentos — {title}</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {activity.key} - {activity.title}
          </p>
        </div>

        {groups.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Nenhum apontamento.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.map((group) => {
              const isExpanded = expandedAuthors.has(group.author);
              return (
                <div key={group.author}>
                  <button
                    type="button"
                    onClick={() => toggleAuthor(group.author)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', color: 'var(--text-muted)', fontSize: 11 }}>
                      ▸
                    </span>
                    <PersonAvatar name={group.author} avatarUrl={avatarUrlByPerson[group.author]} size={22} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{group.author}</span>
                    <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {formatHoursMinutes(group.totalHours)}
                    </span>
                  </button>
                  {isExpanded && (
                    <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: '0 0 0 38px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {group.entries.map((entry, i) => (
                        <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {formatShort(entry.date)}
                          </span>{' '}
                          · <strong className="tabular-nums">{formatHoursMinutes(entry.hours)}</strong>
                          {entry.comment && <div style={{ color: 'var(--text-muted)', marginTop: 1 }}>{entry.comment}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid var(--baseline)',
              background: 'var(--surface-1)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
