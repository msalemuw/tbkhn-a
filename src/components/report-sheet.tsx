import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { Alert } from '@/lib/alert';
import { confirmBlock, reportMember } from '@/lib/blocks';
import { reportPost } from '@/lib/feed';

/** What is being reported: a post, or a member (optionally with the comment or message that caused it). */
export type ReportTarget = { me: string; name: string; profileId: string; postId?: string; quote?: string };

const REASONS = ['Spam', 'Harassment or bullying', 'Nudity or inappropriate content', 'Scam or fraud', 'Fake account', 'Something else'];

/**
 * Meta-style report: tap Report, pick a reason, done. Afterwards offers to block the person in one more tap.
 * Render it once per screen and set `target` to start; `onClose` clears it.
 */
export function ReportSheet({ target, onClose, onBlocked }: { target: ReportTarget | null; onClose: () => void; onBlocked?: () => void }) {
  const actions: SheetAction[] = target
    ? REASONS.map((reason) => ({ label: reason, onPress: () => submit(target, reason, onBlocked) }))
    : [];
  return <ActionSheet title={target ? 'Why are you reporting this?' : null} actions={actions} onClose={onClose} />;
}

function submit(t: ReportTarget, reason: string, onBlocked?: () => void) {
  const text = t.quote ? `${reason} · “${t.quote.slice(0, 300)}”` : reason;
  const send = t.postId && !t.quote ? reportPost(t.me, t.postId, text) : reportMember(t.me, t.profileId, text);
  send.then(
    () =>
      Alert.alert('Thanks for letting us know', 'Our team will take a look. You can also block this person so you don’t see them any more.', [
        { text: 'Done', style: 'cancel' },
        { text: `Block ${t.name}`, style: 'destructive', onPress: () => confirmBlock(t.name, t.profileId, onBlocked) },
      ]),
    () => Alert.alert('We couldn’t send your report', 'Check your connection and try again.'),
  );
}
