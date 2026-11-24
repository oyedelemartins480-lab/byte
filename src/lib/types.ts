export type RoomType = "build" | "lockin";

export type Room = {
  id: string;
  name: string;
  type: RoomType;
  visibility: "private" | "public";
  owner_id: string;
  invite_code: string;
  ai_enabled: boolean;
  created_at: string;
};

export type Member = {
  id: string;
  name: string;
  username: string;
  role: string | null;
  avatar_url: string | null;
  member_role: "owner" | "member";
};

export type MessageType =
  | "text"
  | "gif"
  | "sticker"
  | "file"
  | "voice"
  | "system"
  | "checkin"
  | "progress"
  | "done"
  | "ai"
  | "recap"
  | "integration";

export type GifMeta = { url: string; preview?: string; width: number; height: number; title?: string };
export type StickerMeta = { id: string; src: string; label: string };
export type FileMeta = { path: string; name: string; size: number; mime: string };
export type VoiceMeta = { path: string; mime: string; size: number; duration: number; transcript?: string };

export type Reaction = { message_id: string; user_id: string; emoji: string };

export type Message = {
  id: string;
  room_id: string;
  user_id: string | null;
  type: MessageType;
  body: string;
  meta: Record<string, unknown>;
  reply_to: string | null;
  session_id?: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  // client-only
  pending?: boolean;
  failed?: boolean;
};

export type SidebarRoom = Pick<Room, "id" | "name" | "type" | "visibility"> & { member_role: string };

export type Session = {
  id: string;
  room_id: string;
  created_by: string;
  title: string;
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
  checkin_interval_min: number;
  finalized_at: string | null;
  team_score: number | null;
  recap_status: "none" | "working" | "done" | "failed";
  created_at: string;
};

export type Participant = {
  session_id: string;
  room_id: string;
  user_id: string;
  goal: string | null;
  done_text: string | null;
  goal_met: "yes" | "partly" | "no" | null;
  focus_seconds: number;
  away_seconds: number;
  break_seconds: number;
  on_break: boolean;
  focus_score: number | null;
  goal_kind?: "task" | "reading";
  pages_total?: number | null;
  pages_read?: number | null;
  joined_at: string;
  dropped_at: string | null;
};

export type Task = { who: string; what: string };

export type SessionSummary = {
  session_id: string;
  room_id: string;
  summary: string;
  extracted: { decisions?: string[]; tasks?: Task[]; blockers?: string[] };
  last_message_at: string | null;
  updated_at: string;
};

export type RecapPerson = {
  user_id: string;
  name: string;
  goal: string | null;
  done: string | null;
  goal_met: "yes" | "partly" | "no" | null;
  focus_pct: number | null;
  score: number | null;
  pages_read?: number | null;
  pages_total?: number | null;
};

export type Recap = {
  session_id: string;
  session_title: string;
  starts_at: string;
  ends_at: string;
  summary: string;
  decisions: string[];
  tasks: Task[];
  blockers: string[];
  links: string[];
  people: RecapPerson[];
  team_score: number | null;
  ai: boolean;
};

export type SessionRecapRow = {
  session_id: string;
  room_id: string;
  summary: string;
  recap: Recap;
  team_score: number | null;
  ai: boolean;
  created_at: string;
};

/** A Google Drive file or Notion page shared into a room (stored in a text message's meta). */
export type Attachment = {
  source: "drive" | "notion";
  title: string;
  url: string;
  icon?: string | null;
  mime?: string;
  kind?: string;
};
