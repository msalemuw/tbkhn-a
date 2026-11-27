import { type FilterChip, type FilterSection, FilterSheet } from '@/components/filter-sheet';
import type { MyCommunity } from '@/lib/posts';

export type Watching = { communities: string[]; nearby: boolean; following: boolean; /** Show only critics' posts, nearest first. */ criticsOnly?: boolean; /** Show only posts that have a recipe, on top of the communities chosen. */ recipesOnly?: boolean };

/** Home "Feed filter" from the design: choose which communities, nearby (public) posts and followed cooks fill the feed. */
export function WatchingSheet({
  visible,
  mine,
  value,
  onChange,
  onClose,
  onNearbyOn,
  applyLabel,
  showCritics,
}: {
  visible: boolean;
  mine: MyCommunity[];
  value: Watching;
  onChange: (w: Watching) => void;
  onClose: () => void;
  /** Called when the member ticks Nearby on. */
  onNearbyOn?: () => void;
  /** The Apply button's words, for example "Show 12 posts". */
  applyLabel?: string;
  /** The Critics chip only shows once at least one critic is approved. */
  showCritics?: boolean;
}) {
  // Everything starts ticked and each row is a normal tick box. "Clear all" lets you pick just one or two quickly;
  // Apply waits until something is ticked, and closing with nothing ticked goes back to everything.
  const everything: Watching = { communities: mine.map((c) => c.id), nearby: true, following: true };
  const nothing: Watching = { communities: [], nearby: false, following: false };
  const criticsOnly = !!value.criticsOnly;
  const toggle = (id: string) => onChange({ ...value, communities: value.communities.includes(id) ? value.communities.filter((c) => c !== id) : [...value.communities, id] });
  const toggleNearby = () => {
    onChange({ ...value, nearby: !value.nearby });
    if (!value.nearby) onNearbyOn?.();
  };
  const toggleFollowing = () => onChange({ ...value, following: !value.following });
  const empty = !criticsOnly && !value.nearby && !value.following && !value.communities.length;
  const close = () => {
    if (empty) onChange(everything);
    onClose();
  };
  // The quick choices: one tap, always in view, exactly one picked.
  const recipesOnly = !!value.recipesOnly;
  const chips: FilterChip[] = [
    { key: 'all', label: 'Everything', icon: 'apps', on: !criticsOnly && !recipesOnly, onPress: () => onChange({ ...value, criticsOnly: false, recipesOnly: false }) },
    { key: 'recipes', label: 'Recipes', icon: 'menu-book', on: recipesOnly && !criticsOnly, onPress: () => onChange({ ...value, criticsOnly: false, recipesOnly: true }) },
    ...(showCritics || criticsOnly ? [{ key: 'critics', label: 'Critics near me', icon: 'workspace-premium' as const, on: criticsOnly, onPress: () => onChange({ ...value, criticsOnly: true, recipesOnly: false }) }] : []),
  ];
  // Where the posts come from. Critics are shown nearest first whatever is ticked here, so the list steps aside for them.
  const sections: FilterSection[] = [
    {
      label: 'WHERE FROM',
      dim: criticsOnly ? 'Critics are shown nearest first.' : undefined,
      rows: [
        ...mine.map((c) => ({ key: c.id, icon: (c.kind === 'club' ? 'flag' : 'groups') as 'flag' | 'groups', label: c.name, on: value.communities.includes(c.id), onPress: () => toggle(c.id) })),
        { key: 'nearby', icon: 'near-me' as const, label: 'Nearby', on: value.nearby, onPress: toggleNearby },
        { key: 'following', icon: 'person' as const, label: 'Following', on: value.following, onPress: toggleFollowing },
      ],
    },
  ];
  return <FilterSheet visible={visible} title="Feed filter" sub="" chips={chips} chipsLabel="WHAT TO SHOW" sections={sections} onClose={close} onSelectAll={() => onChange(everything)} onClearAll={() => onChange(nothing)} applyLabel={applyLabel} />;
}
