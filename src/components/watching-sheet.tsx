import { type FilterSection, FilterSheet } from '@/components/filter-sheet';
import type { MyCommunity } from '@/lib/posts';

export type Watching = { communities: string[]; nearby: boolean; following: boolean };

/** Home "Feed filter" from the design: choose which communities, public posts and followed cooks fill the feed. */
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
  const toggle = (id: string) =>
    onChange({ ...value, communities: value.communities.includes(id) ? value.communities.filter((c) => c !== id) : [...value.communities, id] });
  const sections: FilterSection[] = [
    {
      label: 'COMMUNITIES',
      rows: [
        ...mine.map((c) => ({ key: c.id, icon: (c.kind === 'club' ? 'flag' : 'groups') as 'flag' | 'groups', label: c.name, on: value.communities.includes(c.id), onPress: () => toggle(c.id) })),
        { key: 'public', icon: 'public' as const, label: 'Public', on: value.nearby, onPress: () => onChange({ ...value, nearby: !value.nearby }) },
        { key: 'following', icon: 'person' as const, label: 'Following', on: value.following, onPress: () => onChange({ ...value, following: !value.following }) },
      ],
    },
  ];
  return <FilterSheet visible={visible} title="Feed filter" sub="Choose whose posts show on your Home feed." sections={sections} onClose={onClose} />;
}
