import type { Page } from '../server/pages';
import { api } from './api';
import type { PageAutosave } from './editor/autosave';
/** Manual owner metadata change, separate from producer page-effect approval. */
export async function archiveSavedPage(
  controller: Pick<PageAutosave, 'flush' | 'getSnapshot'>,
  archived: boolean,
  assertCurrent: () => void,
): Promise<Page> {
  assertCurrent();
  if (!(await controller.flush(true)))
    throw new Error(
      'Save or resolve the current draft before changing archive status.',
    );
  assertCurrent();
  const page = controller.getSnapshot().page;
  if (!page) throw new Error('The current page is unavailable.');
  const result = await api<Page>(
    `/spaces/${encodeURIComponent(page.spaceId)}/pages/${encodeURIComponent(page.id)}`,
    'PATCH',
    {
      expectedRevision: page.revision,
      archived,
    },
  );
  assertCurrent();
  if (
    result.id !== page.id ||
    result.spaceId !== page.spaceId ||
    result.revision <= page.revision ||
    !!result.archived !== archived
  )
    throw new Error(
      'Archive receipt does not match this page. Refresh to inspect its current status.',
    );
  return result;
}
