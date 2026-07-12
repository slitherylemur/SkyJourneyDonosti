import { useEffect, useReducer } from "@rbxts/react";
import type { Store } from "client/ui/store";

/** Re-renders on every store notification; selection happens during render so it can never go stale. */
export function useStoreSelector<T, S>(store: Store<T>, selector: (state: T) => S): S {
	const [, forceUpdate] = useReducer((version: number) => version + 1, 0);

	useEffect(() => {
		return store.subscribe(() => forceUpdate());
	}, [store]);

	return selector(store.get());
}
