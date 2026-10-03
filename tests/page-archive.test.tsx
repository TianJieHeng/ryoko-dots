import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Page } from '../src/server/pages';
import { api } from '../src/client/api';
import { archiveSavedPage } from '../src/client/page-archive';
import { SpaceLibrary } from '../src/client/SpaceLibrary';
vi.mock('../src/client/api', () => ({ api: vi.fn() }));
const page: Page = {
  id: 'page / one',
  spaceId: 'space / one',
  title: 'Live page',
  content: 'Owner draft',
  revision: 3,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  sourceThreadId: null,
  archived: false,
};
const controller = (saved = true) => ({
  flush: vi.fn(async () => saved),
  getSnapshot: () => ({ page, status: 'saved' as const }),
});
beforeEach(() => {
  vi.mocked(api).mockReset();
  page.revision = 3;
});
it('flushes the owner draft and archives exactly the newly saved revision', async () => {
  const c = controller();
  c.flush.mockImplementation(async () => {
    page.revision = 4;
    return true;
  });
  vi.mocked(api).mockResolvedValue({ ...page, revision: 5, archived: true });
  const guard = vi.fn();
  const result = await archiveSavedPage(c, true, guard);
  expect(c.flush).toHaveBeenCalledWith(true);
  expect(api).toHaveBeenCalledWith(
    '/spaces/space%20%2F%20one/pages/page%20%2F%20one',
    'PATCH',
    { expectedRevision: 4, archived: true },
  );
  expect(result.archived).toBe(true);
  expect(guard).toHaveBeenCalledTimes(3);
});
it('never archives an unsaved conflict or a dismissed page', async () => {
  await expect(
    archiveSavedPage(controller(false), true, () => {}),
  ).rejects.toThrow('Save or resolve');
  let checks = 0;
  await expect(
    archiveSavedPage(controller(), true, () => {
      if (++checks === 2) throw new Error('Page changed');
    }),
  ).rejects.toThrow('Page changed');
  expect(api).not.toHaveBeenCalled();
});
it('does not accept a different page, wrong archive value, or non-advancing receipt', async () => {
  for (const returned of [
    { ...page, id: 'foreign', revision: 10, archived: true },
    { ...page, revision: 10, archived: false },
    { ...page, archived: true },
  ]) {
    vi.mocked(api).mockResolvedValue(returned);
    await expect(
      archiveSavedPage(controller(), true, () => {}),
    ).rejects.toThrow('receipt');
  }
});
it('retains an explicit archived-page filter while hiding archived rows from the default library', () => {
  const html = renderToStaticMarkup(
    <SpaceLibrary
      space={{
        id: page.spaceId,
        name: 'Workspace',
        description: '',
        createdAt: 1,
      }}
      pages={[
        page,
        {
          ...page,
          id: 'archived-page',
          title: 'Hidden archived title',
          archived: true,
        },
      ]}
      onPage={() => {}}
      onNew={() => {}}
    />,
  );
  expect(html).toContain('Show archived pages');
  expect(html).toContain('Live page');
  expect(html).not.toContain('Hidden archived title');
});
