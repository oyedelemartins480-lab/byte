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
  member_role: "owner" | "member";
};

export type MessageType = "text" | "gif" | "sticker" | "file" | "system" | "checkin" | "progress" | "done";

export type GifMeta = { url: string; preview?: string; width: number; height: number; title?: string };
export type StickerMeta = { id: string; src: string; label: string };
export type FileMeta = { path: string; name: string; size: number; mime: string };

export type Reaction = { message_id: string; user_id: string; emoji: string };

export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  type: MessageType;
  body: string;
  meta: Record<string, unknown>;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  // client-only
  pending?: boolean;
  failed?: boolean;
};

export type SidebarRoom = Pick<Room, "id" | "name" | "type" | "visibility"> & { member_role: string };
