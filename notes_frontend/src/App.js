import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

function getApiBase() {
  // CRA exposes env vars at build time. Preview manifest provides API_BASE/BACKEND_URL.
  return (
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    process.env.API_BASE ||
    process.env.BACKEND_URL ||
    'http://localhost:3001'
  );
}

async function apiFetch(path, options) {
  const base = getApiBase().replace(/\/+$/, '');
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options && options.headers ? options.headers : {}),
    },
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch (e) {
      // ignore
    }
    throw new Error(detail);
  }

  // DELETE returns JSON too in our API
  return res.json();
}

function tagStringFromNote(note) {
  const tags = (note.tags || []).map(t => (typeof t === 'string' ? t : t.name)).filter(Boolean);
  return tags.join(', ');
}

function parseTagsInput(value) {
  return (value || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

// PUBLIC_INTERFACE
function App() {
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);

  const [activeTag, setActiveTag] = useState('');
  const [searchQ, setSearchQ] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // note or null

  const apiBase = useMemo(() => getApiBase(), []);

  async function refreshTags() {
    const data = await apiFetch('/tags');
    setTags(data || []);
  }

  async function refreshNotes({ tag, q } = {}) {
    const t = (tag !== undefined ? tag : activeTag) || '';
    const qq = (q !== undefined ? q : searchQ) || '';
    const isSearching = qq.trim().length > 0;

    const params = new URLSearchParams();
    if (t) params.set('tag', t);

    setLoading(true);
    setError('');
    try {
      const data = isSearching
        ? await apiFetch(`/search?q=${encodeURIComponent(qq)}&${params.toString()}`)
        : await apiFetch(`/notes?${params.toString()}`);

      setNotes((data && data.items) || []);
    } catch (e) {
      setError(e.message || 'Failed to load notes');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial load
    refreshTags();
    refreshNotes({ tag: '', q: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateNew() {
    setEditing({
      title: '',
      content: '',
      tagsInput: '',
    });
    setEditorOpen(true);
  }

  async function onEdit(note) {
    setEditing({
      id: note.id,
      title: note.title || '',
      content: note.content || '',
      is_archived: !!note.is_archived,
      tagsInput: tagStringFromNote(note),
    });
    setEditorOpen(true);
  }

  async function onDelete(note) {
    if (!window.confirm(`Delete "${note.title}"?`)) return;
    setError('');
    try {
      await apiFetch(`/notes?note_id=${encodeURIComponent(note.id)}`, { method: 'DELETE' });
      await refreshTags();
      await refreshNotes();
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  }

  async function onSave() {
    if (!editing) return;
    const title = (editing.title || '').trim();
    const content = (editing.content || '').trim();
    const tagsList = parseTagsInput(editing.tagsInput);

    if (!title || !content) {
      setError('Title and content are required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (editing.id) {
        await apiFetch('/notes', {
          method: 'PUT',
          body: JSON.stringify({
            id: editing.id,
            title,
            content,
            tags: tagsList,
            is_archived: !!editing.is_archived,
          }),
        });
      } else {
        await apiFetch('/notes', {
          method: 'POST',
          body: JSON.stringify({
            title,
            content,
            tags: tagsList,
          }),
        });
      }
      setEditorOpen(false);
      setEditing(null);
      await refreshTags();
      await refreshNotes();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  async function onApplyFilters() {
    await refreshNotes();
  }

  async function onClearFilters() {
    setActiveTag('');
    setSearchQ('');
    await refreshNotes({ tag: '', q: '' });
  }

  return (
    <div className="nm-root">
      <div className="nm-topbar">
        <div className="nm-brand">
          <div className="nm-brand__title">Notemaster</div>
          <div className="nm-brand__subtitle">Retro notes, tags, and search</div>
        </div>

        <div className="nm-topbar__actions">
          <button className="nm-btn nm-btn--primary" onClick={onCreateNew}>
            + New note
          </button>
        </div>
      </div>

      <div className="nm-layout">
        <aside className="nm-sidebar" aria-label="Tags sidebar">
          <div className="nm-sidebar__section">
            <div className="nm-sidebar__heading">Tags</div>
            <button
              className={`nm-tagRow ${activeTag === '' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveTag('');
                refreshNotes({ tag: '', q: searchQ });
              }}
            >
              <span className="nm-tagRow__name">All notes</span>
              <span className="nm-tagRow__count">{notes.length}</span>
            </button>

            <div className="nm-tagList">
              {tags.map(t => (
                <button
                  key={t.id}
                  className={`nm-tagRow ${activeTag === t.name ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveTag(t.name);
                    refreshNotes({ tag: t.name, q: searchQ });
                  }}
                  title={`Filter by ${t.name}`}
                >
                  <span className="nm-tagDot" style={{ background: t.color || '#64748b' }} />
                  <span className="nm-tagRow__name">{t.name}</span>
                  <span className="nm-tagRow__count">{t.note_count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="nm-sidebar__section">
            <div className="nm-sidebar__heading">API</div>
            <div className="nm-muted" style={{ wordBreak: 'break-all' }}>
              {apiBase}
            </div>
          </div>
        </aside>

        <main className="nm-main" aria-label="Notes">
          <div className="nm-toolbar">
            <div className="nm-field">
              <label className="nm-label" htmlFor="search">
                Search
              </label>
              <input
                id="search"
                className="nm-input"
                placeholder="Search title or content…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onApplyFilters();
                }}
              />
            </div>

            <div className="nm-field">
              <label className="nm-label" htmlFor="tagFilter">
                Tag filter
              </label>
              <input
                id="tagFilter"
                className="nm-input"
                placeholder="Type a tag name…"
                value={activeTag}
                onChange={e => setActiveTag(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onApplyFilters();
                }}
              />
            </div>

            <div className="nm-toolbar__buttons">
              <button className="nm-btn" onClick={onApplyFilters} disabled={loading}>
                Apply
              </button>
              <button className="nm-btn nm-btn--ghost" onClick={onClearFilters} disabled={loading}>
                Clear
              </button>
            </div>
          </div>

          {error ? <div className="nm-alert">Error: {error}</div> : null}
          {loading ? <div className="nm-muted">Loading…</div> : null}

          <div className="nm-notes">
            {notes.map(n => (
              <article key={n.id} className="nm-note">
                <div className="nm-note__header">
                  <h2 className="nm-note__title">{n.title}</h2>
                  <div className="nm-note__actions">
                    <button className="nm-btn nm-btn--small" onClick={() => onEdit(n)}>
                      Edit
                    </button>
                    <button className="nm-btn nm-btn--small nm-btn--danger" onClick={() => onDelete(n)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className="nm-note__meta">
                  <span className="nm-chip">{(n.tags || []).length} tag(s)</span>
                  {n.is_archived ? <span className="nm-chip nm-chip--muted">Archived</span> : null}
                </div>

                <div className="nm-note__content">{n.content}</div>

                {(n.tags || []).length ? (
                  <div className="nm-note__tags">
                    {(n.tags || []).map(t => (
                      <button
                        key={t.id || t.name}
                        className="nm-chip nm-chip--tag"
                        onClick={() => {
                          setActiveTag(t.name);
                          refreshNotes({ tag: t.name, q: searchQ });
                        }}
                        title={`Filter by ${t.name}`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}

            {!loading && notes.length === 0 ? (
              <div className="nm-empty">
                <div className="nm-empty__title">No notes found</div>
                <div className="nm-muted">Try clearing filters or create a new note.</div>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {editorOpen ? (
        <div className="nm-modalBackdrop" role="dialog" aria-modal="true" aria-label="Note editor">
          <div className="nm-modal">
            <div className="nm-modal__header">
              <div className="nm-modal__title">{editing && editing.id ? 'Edit note' : 'New note'}</div>
              <button
                className="nm-btn nm-btn--ghost"
                onClick={() => {
                  setEditorOpen(false);
                  setEditing(null);
                  setError('');
                }}
              >
                Close
              </button>
            </div>

            <div className="nm-modal__body">
              <div className="nm-field">
                <label className="nm-label" htmlFor="title">
                  Title
                </label>
                <input
                  id="title"
                  className="nm-input"
                  value={(editing && editing.title) || ''}
                  onChange={e => setEditing(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="nm-field">
                <label className="nm-label" htmlFor="content">
                  Content
                </label>
                <textarea
                  id="content"
                  className="nm-textarea"
                  rows={8}
                  value={(editing && editing.content) || ''}
                  onChange={e => setEditing(prev => ({ ...prev, content: e.target.value }))}
                />
              </div>

              <div className="nm-field">
                <label className="nm-label" htmlFor="tags">
                  Tags (comma-separated)
                </label>
                <input
                  id="tags"
                  className="nm-input"
                  placeholder="work, personal, ideas"
                  value={(editing && editing.tagsInput) || ''}
                  onChange={e => setEditing(prev => ({ ...prev, tagsInput: e.target.value }))}
                />
              </div>

              {editing && editing.id ? (
                <div className="nm-field nm-field--row">
                  <label className="nm-checkbox">
                    <input
                      type="checkbox"
                      checked={!!editing.is_archived}
                      onChange={e => setEditing(prev => ({ ...prev, is_archived: e.target.checked }))}
                    />
                    Archived
                  </label>
                </div>
              ) : null}

              {error ? <div className="nm-alert">Error: {error}</div> : null}
            </div>

            <div className="nm-modal__footer">
              <button className="nm-btn nm-btn--primary" onClick={onSave} disabled={loading}>
                Save
              </button>
              <button
                className="nm-btn"
                onClick={() => {
                  setEditorOpen(false);
                  setEditing(null);
                  setError('');
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
