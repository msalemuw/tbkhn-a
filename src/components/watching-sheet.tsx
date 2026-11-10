import { type FilterSection, FilterSheet } from '@/components/filter-sheet';
import type { MyCommunity } from '@/lib/posts';

export type Watching = { communities: string[]; nearby: boolean; following: boolean };

/** Home "Feed filter" from the design: choose which communities, nearby (public) posts and followed cooks fill the feed. */
export function WatchingSheet({
  visible,
  mine,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  mine: MyCommunity[];
  value: Watching;
  onChange: (w: Watching) => void;
  onClose: () => void;
}) {
  // Everything starts ticked. Tapping a row while everything is ticked shows only that row (one tap instead of un-ticking each);
  // un-ticking the last one goes back to everything, so the feed is never emptied by accident.
  const allOn = value.nearby && value.following && mine.every((c) => value.communities.includes(c.id));
  const everything: Watching = { communities: mine.map((c) => c.id), nearby: true, following: true };
  const set = (next: Watching) => onChange(!next.nearby && !next.following && !next.communities.length ? everything : next);
  const toggle = (id: string) =>
    set(allOn ? { communities: [id], nearby: false, following: false } : { ...value, communities: value.communities.includes(id) ? value.communities.filter((c) => c !== id) : [...value.communities, id] });
  const toggleNearby = () => set(allOn ? { communities: [], nearby: true, following: false } : { ...value, nearby: !value.nearby });
  const toggleFollowing = () => set(allOn ? { communities: [], nearby: false, following: true } : { ...value, following: !value.following });
  const sections: FilterSection[] = [
    {
      label: 'COMMUNITIES',
      rows: [
        ...mine.map((c) => ({ key: c.id, icon: (c.kind === 'club' ? 'flag' : 'groups') as 'flag' | 'groups', label: c.name, on: value.communities.includes(c.id), onPress: () => toggle(c.id) })),
        { key: 'nearby', icon: 'near-me' as const, label: 'Nearby', on: value.nearby, onPress: toggleNearby },
        { key: 'following', icon: 'person' as const, label: 'Following', on: value.following, onPress: toggleFollowing },
      ],
    },
  ];
  return <FilterSheet visible={visible} title="Feed filter" sub="Everything shows by default. Tap one to see only that." sections={sections} onClose={onClose} />;
}
