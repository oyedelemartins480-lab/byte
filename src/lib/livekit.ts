import "server-only";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

export function livekitConfig() {
  const url = process.env.LIVEKIT_URL ?? "";
  const key = process.env.LIVEKIT_API_KEY ?? "";
  const secret = process.env.LIVEKIT_API_SECRET ?? "";
  return { url, key, secret, ready: Boolean(url && key && secret) };
}

export const huddleRoomName = (roomId: string) => `byte-${roomId}`;

export async function huddleToken(roomId: string, identity: string, name: string, avatarUrl: string | null) {
  const { key, secret } = livekitConfig();
  const at = new AccessToken(key, secret, {
    identity,
    name,
    ttl: "4h",
    metadata: JSON.stringify({ avatar_url: avatarUrl }),
  });
  at.addGrant({
    room: huddleRoomName(roomId),
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}

/** Who's in a room's huddle right now. Empty when LiveKit isn't set up or the room is empty. */
export async function huddleParticipants(roomId: string) {
  const { url, key, secret, ready } = livekitConfig();
  if (!ready) return [];
  const svc = new RoomServiceClient(url.replace(/^ws/, "http"), key, secret);
  try {
    const list = await svc.listParticipants(huddleRoomName(roomId));
    return list.map((p) => ({ id: p.identity, name: p.name }));
  } catch {
    return []; // the LiveKit room doesn't exist until someone joins
  }
}
