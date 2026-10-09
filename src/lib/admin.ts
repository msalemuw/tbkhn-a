import { supabase } from '@/lib/supabase';

// Admin panel (docs: admin plan, steps 3 to 7). Staff use the same app; every read and change goes
// through the admin_* database functions, which check the caller's role and log each action.

export type StaffRole = 'owner' | 'moderator' | 'support';

export type Overview = {
  pending_communities: number;
  open_reports: number;
  suspended_members: number;
  members: number;
  signups_7d: number;
};

export type CommunityRequest = {
  id: string;
  name: string;
  kind: string;
  governorate: string;
  area: string | null;
  created_at: string;
  requested_by: string | null;
  requester_username: string | null;
  requester_name: string | null;
};

export type ReportGroup = {
  report_ids: string[];
  post_id: string | null;
  profile_id: string | null;
  reports: number;
  reasons: string[];
  first_at: string;
  post_kind: string | null;
  post_dish: string | null;
  post_caption: string | null;
  post_removed: boolean | null;
  owner_id: string | null;
  owner_username: string | null;
  owner_name: string | null;
  owner_suspended: boolean | null;
};

export type Member = {
  id: string;
  username: string | null;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  governorate: string | null;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  staff_role: StaffRole | null;
  posts: number;
  orders: number;
  open_reports: number;
};

export type AdminCommunity = { id: string; name: string; kind: string; governorate: string; area: string | null; members: number };

export type OrderState = 'open' | 'done' | 'cancelled';

export type AdminOrder = {
  id: string;
  created_at: string;
  updated_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'ready' | 'picked_up' | 'cancelled';
  payment_status: 'none' | 'sent' | 'received';
  plates: number;
  price_egp: number | null;
  pickup_at: string | null;
  note: string | null;
  cancel_reason: string | null;
  dish_name: string | null;
  community_name: string | null;
  buyer_id: string;
  buyer_username: string | null;
  buyer_name: string | null;
  cook_id: string;
  cook_username: string | null;
  cook_name: string | null;
};

export type OrderEvent = { event: string; actor_username: string | null; actor_name: string | null; note: string | null; created_at: string };

export type ReferralRow = { week_start: string; heard_from: string | null; signups: number };
export type InviterRow = { inviter_name: string; signups: number; last_at: string };

export type AdminAction = {
  id: number;
  created_at: string;
  actor_username: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  details: Record<string, unknown>;
};

/** Who may do what; the database enforces the same rules. */
export const canAct = (role: StaffRole | null) => role === 'owner' || role === 'moderator';

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchStaffRole = () => call<StaffRole | null>('staff_role');
export const fetchOverview = async () => (await call<Overview[]>('admin_overview'))[0];
export const fetchCommunityRequests = () => call<CommunityRequest[]>('admin_community_requests');
export const reviewCommunity = (id: string, status: 'approved' | 'rejected', note?: string) =>
  call('admin_review_community', { p_id: id, p_status: status, p_note: note ?? null });
export const fetchOpenReports = () => call<ReportGroup[]>('admin_open_reports');
export const dismissReports = (g: ReportGroup, note?: string) =>
  call<number>('admin_dismiss_reports', { p_post_id: g.post_id, p_profile_id: g.profile_id, p_note: note ?? null });
export const removePost = (postId: string, reason: string) => call('admin_remove_post', { p_post_id: postId, p_reason: reason });
export const findMembers = (query: string) => call<Member[]>('admin_find_members', { p_query: query });
export const setSuspended = (userId: string, suspended: boolean, reason?: string) =>
  call('admin_set_suspended', { p_user_id: userId, p_suspended: suspended, p_reason: reason ?? null });
export const setStaffRole = (userId: string, role: StaffRole | null) => call('admin_set_staff_role', { p_user_id: userId, p_role: role });
export const fetchCommunities = () => call<AdminCommunity[]>('admin_communities');
export const postAnnouncement = (title: string, body: string, communityIds: string[] | null) =>
  call('admin_post_announcement', { p_title: title, p_body: body, p_community_ids: communityIds });
export const findOrders = (query: string, state: OrderState | null) => call<AdminOrder[]>('admin_find_orders', { p_query: query, p_state: state });
export const fetchOrderTimeline = (id: string) => call<OrderEvent[]>('admin_order_timeline', { p_id: id });
export const fetchReferralTally = (communityId: string | null) => call<ReferralRow[]>('admin_referral_tally', { p_community_id: communityId });
export const fetchInviterNames = (communityId: string | null) => call<InviterRow[]>('admin_inviter_names', { p_community_id: communityId });
export const fetchRecentActions = () => call<AdminAction[]>('admin_recent_actions', { p_limit: 200 });

/** Short code staff and members can read out for an order: the first 8 characters of its id. */
export const orderCode = (id: string) => id.slice(0, 8).toUpperCase();

/** Plain words for each step of an order. */
export const ORDER_EVENT_LABEL: Record<string, string> = {
  requested: 'Ordered',
  accepted: 'Accepted by cook',
  declined: 'Declined by cook',
  ready: 'Ready for pickup',
  picked_up: 'Picked up',
  cancelled: 'Cancelled by buyer',
  payment_sent: 'Buyer marked InstaPay sent',
  payment_received: 'Cook marked InstaPay received',
};

/** The answers to "How did you hear about tabkheen A?" (sign-up profile screen). */
export const HEARD_LABEL: Record<string, string> = {
  friend: 'A friend',
  family: 'Family',
  community: 'My community',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  snapchat: 'Snapchat',
  social_other: 'Another social app',
  social_media: 'Social media (earlier sign-ups)',
  ad: 'An ad',
  search: 'Search',
  other: 'Other',
};

/** Plain words for the action log. */
export const ACTION_LABEL: Record<string, string> = {
  community_approved: 'Approved community',
  community_rejected: 'Rejected community',
  post_removed: 'Removed post',
  reports_dismissed: 'Dismissed reports',
  member_suspended: 'Suspended member',
  member_unsuspended: 'Lifted suspension',
  staff_role_set: 'Changed staff role',
  announcement_posted: 'Sent announcement',
};
