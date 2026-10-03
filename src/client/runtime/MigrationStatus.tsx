import {
  canRequestCutover,
  migrationSchema,
} from '../../shared/runtime/migration';
import { useResource } from './use-resource';
import type { RuntimeConnection } from './use-runtime';
export function MigrationStatus({
  connection,
}: {
  connection: RuntimeConnection;
}) {
  const migration = useResource(
    '/runtime/migration',
    migrationSchema,
    connection,
    'migration',
  );
  return (
    <section aria-label="Migration and runtime ownership">
      <h3>Ownership and migration</h3>
      {!migration.data && (
        <p role="status">
          Migration inventory is unavailable. Legacy history, approvals,
          schedules and uncertain effects have not been qualified for cutover.
        </p>
      )}
      {migration.error && (
        <p className="chat-error" role="alert">
          {migration.error}
        </p>
      )}
      {migration.data && (
        <>
          <p>
            Sticky runtime owner: {migration.data.runtimeOwner} ·{' '}
            {migration.data.state.replaceAll('_', ' ')} · admissions{' '}
            {migration.data.admissions} · revision {migration.data.revision}
          </p>
          <p>
            Accepted Ryoko work{' '}
            {migration.data.acceptedRyokoWorkPreserved
              ? 'remains Ryoko-owned'
              : 'preservation is not confirmed; stop new admissions'}
            . Rollback never reruns accepted work in the legacy executor.
          </p>
          <ul>
            {migration.data.inventory.map((item) => (
              <li key={item.category}>
                {item.category.replaceAll('_', ' ')}:{' '}
                {item.disposition.replaceAll('_', ' ')} · {item.migrated}{' '}
                migrated / {item.readOnly} read-only / {item.blocked} blocked of{' '}
                {item.total}
              </li>
            ))}
          </ul>
          {migration.data.warnings.map((warning, index) => (
            <p className="notice" key={index}>
              {warning}
            </p>
          ))}
          <p>
            {canRequestCutover(migration.data)
              ? 'Server migration evidence is eligible for a separate deployment/cutover decision. It does not perform deployment.'
              : 'Full-parity cutover remains blocked.'}
          </p>
        </>
      )}
      <p>
        Historical approvals never grant new permission. Uncertain schedules are
        not backfilled. Pending writes, immutable artifact versions and
        unresolved effects must survive rollback.
      </p>
      <button
        type="button"
        onClick={() => void migration.reload()}
        disabled={!connection.available('migration') || migration.loading}
      >
        Refresh read-only inventory
      </button>
    </section>
  );
}
