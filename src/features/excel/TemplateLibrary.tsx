import { useState } from 'react';
import { Card } from '@/components/Card';
import { friendlyError } from '@/lib/errors';
import { downloadFor } from './templates';
import {
  MODULE_NOTE, MODULE_ORDER, REQUIREMENT_LABEL, templatesOf,
  type Requirement, type TemplateModule, type UploadTemplate
} from './templateCatalog';

/**
 * What this system accepts, said on the screen where files are handed to it.
 *
 * Everything here is generated from the catalogue the downloads are built from,
 * so the columns described are the columns in the file, and neither can be
 * updated without the other. The reports are grouped by the part of the factory
 * that keeps them, and each one downloads on its own: nobody in the quality
 * office should have to open a workbook full of HR tabs to find their sheet.
 */

const REQUIREMENT_TONE: Record<Requirement, { bg: string; fg: string }> = {
  required: { bg: 'var(--red-50)', fg: 'var(--red-500)' },
  recommended: { bg: 'var(--blue-50)', fg: 'var(--blue-600)' },
  optional: { bg: 'var(--surface-muted)', fg: 'var(--text-muted)' }
};

const requiredHeaders = (template: UploadTemplate): string[] =>
  template.columns.filter((c) => c.requirement === 'required').map((c) => c.header);

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
      <span style={{ color: 'var(--text-faint)' }}>{label} </span>{value}
    </p>
  );
}

function TemplateEntry({ template }: { template: UploadTemplate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      await downloadFor(template);
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article style={{
      border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px',
      background: 'var(--surface)'
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h4 style={{ font: '600 15px var(--font-heading)', margin: '0 0 4px' }}>{template.title}</h4>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--text-muted)' }}>{template.purpose}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Meta label="Feeds" value={template.landsIn} />
            <Meta label="Uploaded" value={template.cadence} />
            <Meta label="Recognised by" value={template.recognisedBy} />
          </div>
        </div>
        <button type="button" className="btn btn--secondary" style={{ flex: 'none' }}
          disabled={busy} onClick={() => void download()}
          title={`Downloads ${template.fileStem}.xlsx with example rows and a column guide`}>
          {busy ? 'Preparing…' : 'Download template'}
        </button>
      </div>

      {error && <p className="banner banner--error" style={{ marginBottom: 0 }}>{error}</p>}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--blue-600)' }}>
          Columns and rules ({template.columns.length})
        </summary>

        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
          <strong>Must be filled in:</strong> {requiredHeaders(template).join(', ')}
        </p>

        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Column</th>
                <th style={{ width: '12%' }}>Required?</th>
                <th style={{ width: '18%' }}>Format</th>
                <th>What it means</th>
                <th style={{ width: '20%' }}>Other headings accepted</th>
              </tr>
            </thead>
            <tbody>
              {template.columns.map((column) => {
                const tone = REQUIREMENT_TONE[column.requirement];
                return (
                  <tr key={column.header}>
                    <td style={{ fontWeight: 600 }}>{column.header}</td>
                    <td>
                      <span className="chip" style={{ background: tone.bg, color: tone.fg }}>
                        {REQUIREMENT_LABEL[column.requirement]}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{column.format}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{column.meaning}</td>
                    <td style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>
                      {column.alsoAccepted?.join(', ') ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)',
          display: 'flex', flexDirection: 'column', gap: 5 }}>
          {template.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </details>
    </article>
  );
}

const DEFAULT_INTRO = 'Each report has its own template, because each one is kept by different '
  + 'people on different days. Download the one you need, fill in the shaded table, and drop it '
  + 'above — the kind is recognised from the headers, so a file never has to be labelled. Your '
  + 'own sheets are still read as they are: a template is only the layout known to work.';

export function TemplateLibrary({
  modules = MODULE_ORDER,
  title = 'What you can upload',
  intro = DEFAULT_INTRO,
  collapsible = false,
  showModuleHeadings = modules.length > 1
}: {
  /** Which parts of the factory to list. Defaults to all of them. */
  modules?: TemplateModule[];
  title?: string;
  intro?: string;
  /** Folds the whole card away behind one line — for screens that are not the
   *  Upload screen, where the templates are useful but not the point. */
  collapsible?: boolean;
  showModuleHeadings?: boolean;
}) {
  const count = modules.reduce((n, module) => n + templatesOf(module).length, 0);

  const body = (
    <>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--text-muted)' }}>{intro}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {modules.map((module) => (
          <section key={module}>
            {showModuleHeadings && (
              <>
                <h3 className="section-heading" style={{ margin: '0 0 2px' }}>{module}</h3>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-faint)' }}>
                  {MODULE_NOTE[module]}
                </p>
              </>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templatesOf(module).map((template) => (
                <TemplateEntry key={template.id} template={template} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p style={{ margin: '18px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
        Every template opens on a ruled table: the headings in the darker blue are the columns the
        import cannot run without, the yellow rows are examples to type over, and the empty rows
        below them are ready to fill in. Behind it sit two helper sheets — “Column guide”, which
        describes each column, and “Lists”, which holds the values behind any dropdowns so they can
        be read and extended in a table of their own. Neither is ever imported.
      </p>
    </>
  );

  const badge = (
    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
      {count} report{count === 1 ? '' : 's'} · one workbook each
    </span>
  );

  if (!collapsible) {
    return <Card title={title} style={{ marginTop: 16 }} aside={badge}>{body}</Card>;
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <details>
        <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="card__title">{title}</span>
          {badge}
        </summary>
        <div style={{ marginTop: 14 }}>{body}</div>
      </details>
    </Card>
  );
}

