import React, { useMemo, useState } from "react";

import { exportRoomKey, importRoomKey, rotateRoomKey } from "../utils/aes";

export type RoomType = "public" | "private";

export interface RoomDefinition {
  id: string;
  name: string;
  type: RoomType;
  hasLocalKey?: boolean;
}

interface RoomListProps {
  rooms: RoomDefinition[];
  activeRoomId: string | null;
  onSelect: (room: RoomDefinition) => void;
  onCreate: (room: RoomDefinition) => Promise<void> | void;
  onUpdate: (roomId: string, patch: Partial<RoomDefinition>) => void;
  pubkey: string | null;
}

const RoomList: React.FC<RoomListProps> = ({ rooms, activeRoomId, onSelect, onCreate, onUpdate, pubkey }) => {
  const [newRoomName, setNewRoomName] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("public");

  const isCreateDisabled = useMemo(() => newRoomName.trim().length === 0, [newRoomName]);

  const handleCreateRoom = async () => {
    if (isCreateDisabled) return;
    const normalizedId = newRoomName.trim().toLowerCase().replace(/\s+/g, "-");
    try {
      await onCreate({
        id: normalizedId,
        name: newRoomName.trim(),
        type: roomType,
        hasLocalKey: roomType === "private",
      });
      setNewRoomName("");
      setRoomType("public");
    } catch (error) {
      console.error("Failed to create room", error);
    }
  };

  const handleImportRoomKey = async (room: RoomDefinition) => {
    const payload = window.prompt("Paste the exported key payload for this room");
    if (!payload) return;
    const senderPubkey = window.prompt(
      "Enter the sender's pubkey (required for decrypting NIP-04 payloads). Leave blank if not applicable.",
    );
    try {
      await importRoomKey(room.id, payload, {
        senderPubkey: senderPubkey?.trim() ? senderPubkey.trim() : undefined,
        nip04: window.nostr?.nip04,
      });
      onUpdate(room.id, { hasLocalKey: true });
      window.alert("Room key imported. You can now read and send encrypted messages in this room.");
    } catch (error) {
      console.error("Failed to import room key", error);
      window.alert("Failed to import room key. Check the payload and try again.");
    }
  };

  const handleExportRoomKey = async (event: React.MouseEvent, room: RoomDefinition) => {
    event.stopPropagation();
    try {
      const recipientPubkey = window.prompt("Enter the recipient's pubkey (optional, used for NIP-04 encryption)") ?? undefined;
      const payload = await exportRoomKey(room.id, {
        recipientPubkey: recipientPubkey?.trim() ? recipientPubkey.trim() : undefined,
        senderPubkey: pubkey ?? undefined,
        nip04: window.nostr?.nip04,
      });
      window.prompt("Share this room key payload with trusted members", payload);
    } catch (error) {
      console.error("Failed to export room key", error);
      window.alert("Failed to export room key. Try again.");
    }
  };

  const handleRotateRoomKey = async (event: React.MouseEvent, room: RoomDefinition) => {
    event.stopPropagation();
    try {
      await rotateRoomKey(room.id);
      onUpdate(room.id, { hasLocalKey: true });
      const payload = await exportRoomKey(room.id, {
        senderPubkey: pubkey ?? undefined,
        nip04: window.nostr?.nip04,
      });
      window.prompt("Room key rotated. Share the new payload with members", payload);
    } catch (error) {
      console.error("Failed to rotate room key", error);
      window.alert("Failed to rotate room key. Try again.");
    }
  };

  return (
    <aside className="flex w-full flex-col gap-6 border-r border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 md:w-72">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--fg-muted)]">Rooms</h2>
        <ul className="mt-4 space-y-2">
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                onClick={() => onSelect(room)}
                className={`w-full rounded-lg px-3 py-2 text-left transition ${
                  activeRoomId === room.id
                    ? "bg-brand text-white shadow-lg"
                    : "bg-[var(--bg-app)] text-[var(--fg-default)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>{room.name}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                    {room.type === "private" ? "Private" : "Public"}
                  </span>
                </div>
                {room.type === "private" && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {!room.hasLocalKey ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleImportRoomKey(room);
                        }}
                        className="font-semibold text-brand underline"
                      >
                        Import room key
                      </button>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => handleExportRoomKey(event, room)}
                          className="font-semibold text-brand underline"
                        >
                          Export key
                        </button>
                        <button
                          type="button"
                          onClick={(event) => handleRotateRoomKey(event, room)}
                          className="font-semibold text-brand underline"
                        >
                          Rotate key
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fg-muted)]">Create room</h3>
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)]">
            Name
            <input
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-sm focus:border-brand focus:outline-none"
              placeholder="Lightning Lounge"
            />
          </label>

          <div className="flex gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)]">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="public"
                checked={roomType === "public"}
                onChange={() => setRoomType("public")}
              />
              Public
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="private"
                checked={roomType === "private"}
                onChange={() => setRoomType("private")}
              />
              Private
            </label>
          </div>

          {roomType === "private" && (
            <p className="text-xs text-[var(--fg-muted)]">
              A new encryption key will be generated automatically for this room. Share it with members after creating the room.
            </p>
          )}

          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={isCreateDisabled}
            className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create room
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RoomList;
