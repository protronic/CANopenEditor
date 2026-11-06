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

  it('resolves a choice with the chosen button or null for Cancel', async () => {
    const dialogs = new DialogService();
    const chosen = dialogs.choose('New project?', ['Empty project', 'DS301 profile']);
    expect(dialogs.current()?.choices).toEqual(['Empty project', 'DS301 profile']);
    dialogs.close('DS301 profile');
    expect(await chosen).toBe('DS301 profile');

    const cancel = dialogs.choose('New project?', ['Empty project', 'DS301 profile']);
    dialogs.close(false);
    expect(await cancel).toBeNull();
  });

  it('resolves a prompt with the entered text or null for Cancel', async () => {
    const dialogs = new DialogService();
    const entered = dialogs.prompt('Name of the new count label:', 'Add Count Label');
    expect(dialogs.current()).toMatchObject({ kind: 'prompt', title: 'Add Count Label', input: '' });
    dialogs.close('Channels');
    expect(await entered).toBe('Channels');

    const cancel = dialogs.prompt('Name of the new storage group:', 'Add Storage Group');
    dialogs.close(false);
    expect(await cancel).toBeNull();
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
