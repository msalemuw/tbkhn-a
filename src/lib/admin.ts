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
export const fetchRecentActions = () => call<AdminAction[]>('admin_recent_actions', { p_limit: 200 });

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
