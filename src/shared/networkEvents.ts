/** Server -> client events. Add new networked actions here only. */
export interface ServerToClientEvents {
	/** Client should start controlling this mount. kind selects the client controller. */
	Mount: (mountModel: Model, kind: string) => void;
	/** Client must stop controlling its current mount. */
	Unmount: () => void;
}

/** Client -> server events. Add new networked actions here only. */
export interface ClientToServerEvents {
	/** Generic "use the mount" action at a world position (fire, activate, ...). */
	MountTrigger: (targetPos: Vector3, hitPointId?: string) => void;
	/** Player requests to leave the mount. */
	MountExit: () => void;
}

export type ServerToClientEventName = keyof ServerToClientEvents;
export type ClientToServerEventName = keyof ClientToServerEvents;
