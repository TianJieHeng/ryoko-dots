import { featureNames } from '../../shared/runtime/contracts';
import type { RuntimeConnection } from './use-runtime';
export function RuntimeStatus({
  connection,
  compact = false,
}: {
  connection: RuntimeConnection;
  compact?: boolean;
}) {
  const { setup, state, error, reload } = connection;
  return (
    <section
      className="runtime-status"
      aria-label="Self-hosted runtime status"
      aria-live="polite"
    >
      <strong>Ryoko runtime · {state.replaceAll('_', ' ')}</strong>
      {error && <p role="status">{error}</p>}
      {setup && (
        <p>
          {setup.qualified
            ? 'Qualified server binding'
            : 'Integration qualification is still required'}{' '}
          · single-owner workspace
        </p>
      )}
      {!compact && (
        <dl>
          {['controlPlane', 'binding', 'compatibility'].map((name) => {
            const item =
              setup?.[name as 'controlPlane' | 'binding' | 'compatibility'];
            return (
              <div key={name}>
                <dt>{name.replace(/([A-Z])/g, ' $1')}</dt>
                <dd>
                  {item?.state.replaceAll('_', ' ') ?? state}
                  {item?.reason ? `: ${item.reason}` : ''}
                </dd>
              </div>
            );
          })}
          {featureNames.map((name) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                {setup?.features[name].state.replaceAll('_', ' ') ??
                  'unavailable'}
                {setup?.features[name].reason
                  ? `: ${setup.features[name].reason}`
                  : ''}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <button type="button" onClick={reload} disabled={state === 'loading'}>
        Check connection
      </button>
    </section>
  );
}
