export interface UiTarget {
	id: string;
	attachment: Attachment;
}

export interface DamageIndicatorState {
	position: Vector2;
	rotation: number;
	sequence: number;
}

export interface UiState {
	shipHealth: {
		current: number;
		max: number;
	};
	targets: UiTarget[];
	damageIndicator?: DamageIndicatorState;
}

export interface Store<T> {
	get: () => T;
	set: (partial: Partial<T>) => void;
	subscribe: (callback: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
	let state = initial;
	const callbacks = new Set<() => void>();

	return {
		get: () => state,
		set: (partial) => {
			state = { ...state, ...partial };
			for (const callback of callbacks) {
				callback();
			}
		},
		subscribe: (callback) => {
			callbacks.add(callback);
			return () => callbacks.delete(callback);
		},
	};
}

export const uiStore = createStore<UiState>({
	shipHealth: { current: 0, max: 1 },
	targets: [],
	damageIndicator: undefined,
});
