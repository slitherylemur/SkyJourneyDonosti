import { ReplicatedStorage } from "@rbxts/services";
import type { ClientToServerEventName, ClientToServerEvents, ServerToClientEventName, ServerToClientEvents } from "shared/networkEvents";

const NETWORK_FOLDER_NAME = "Network";

type ServerToClientHandler<K extends ServerToClientEventName> = ServerToClientEvents[K];
type ClientToServerHandler<K extends ClientToServerEventName> = (
	player: Player,
	...args: Parameters<ClientToServerEvents[K]>
) => void;

const serverToClientEventNames: ServerToClientEventName[] = ["Mount", "Unmount", "ShipDamage"];
const clientToServerEventNames: ClientToServerEventName[] = ["MountTrigger", "MountExit"];

const remoteEvents = new Map<string, RemoteEvent>();

function getOrCreateNetworkFolder(): Folder {
	const existing = ReplicatedStorage.FindFirstChild(NETWORK_FOLDER_NAME);
	if (existing !== undefined && existing.IsA("Folder")) {
		return existing;
	}

	const folder = new Instance("Folder");
	folder.Name = NETWORK_FOLDER_NAME;
	folder.Parent = ReplicatedStorage;
	return folder;
}

function getRemoteEvent(eventName: string): RemoteEvent {
	const cached = remoteEvents.get(eventName);
	if (cached !== undefined) {
		return cached;
	}

	const folder = getOrCreateNetworkFolder();
	const existing = folder.FindFirstChild(eventName);
	if (existing !== undefined && existing.IsA("RemoteEvent")) {
		remoteEvents.set(eventName, existing);
		return existing;
	}

	const remote = new Instance("RemoteEvent");
	remote.Name = eventName;
	remote.Parent = folder;
	remoteEvents.set(eventName, remote);
	return remote;
}

function waitForRemoteEvent(eventName: string): RemoteEvent {
	const folder = ReplicatedStorage.WaitForChild(NETWORK_FOLDER_NAME) as Folder;
	return folder.WaitForChild(eventName) as RemoteEvent;
}

export function initNetworkServer(): void {
	const folder = getOrCreateNetworkFolder();
	for (const eventName of [...serverToClientEventNames, ...clientToServerEventNames]) {
		if (folder.FindFirstChild(eventName) === undefined) {
			const remote = new Instance("RemoteEvent");
			remote.Name = eventName;
			remote.Parent = folder;
			remoteEvents.set(eventName, remote);
		}
	}

	print("[network.ts] Initialized network remotes on server");
}

export const serverEvents = {
	fire<K extends ServerToClientEventName>(
		player: Player,
		eventName: K,
		...args: Parameters<ServerToClientEvents[K]>
	): void {
		getRemoteEvent(eventName).FireClient(player, ...args);
	},

	on<K extends ClientToServerEventName>(eventName: K, handler: ClientToServerHandler<K>): void {
		getRemoteEvent(eventName).OnServerEvent.Connect((player: Player, ...args: unknown[]) => {
			(handler as (player: Player, ...handlerArgs: unknown[]) => void)(player, ...args);
		});
	},
};

export const clientEvents = {
	fire<K extends ClientToServerEventName>(
		eventName: K,
		...args: Parameters<ClientToServerEvents[K]>
	): void {
		waitForRemoteEvent(eventName).FireServer(...args);
	},

	on<K extends ServerToClientEventName>(eventName: K, handler: ServerToClientHandler<K>): void {
		waitForRemoteEvent(eventName).OnClientEvent.Connect((...args: unknown[]) => {
			(handler as (...handlerArgs: unknown[]) => void)(...args);
		});
	},
};
