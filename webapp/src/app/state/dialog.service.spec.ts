import { describe, expect, it } from 'vitest';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  it('resolves a confirmation with OK or Cancel', async () => {
    const dialogs = new DialogService();
    const ok = dialogs.confirm('Delete PDO?');
    expect(dialogs.current()).toMatchObject({ kind: 'confirm', text: 'Delete PDO?' });
    dialogs.close(true);
    expect(await ok).toBe(true);

    const cancel = dialogs.confirm('Delete PDO?');
    dialogs.close(false);
    expect(await cancel).toBe(false);
    expect(dialogs.current()).toBeNull();
  });

  it('shows queued messages one after another', async () => {
    const dialogs = new DialogService();
    const first = dialogs.error('The file could not be read.');
    void dialogs.warning('The object does not fit into the PDO.');
    expect(dialogs.current()?.kind).toBe('error');
    dialogs.close(true);
    await first;
    expect(dialogs.current()).toMatchObject({ kind: 'warning', title: 'Warning' });
  });
});
