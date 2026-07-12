import React, { useEffect, useState } from "@rbxts/react";
import type { Store } from "client/ui/store";

export function useStoreSelector<T, S>(store: Store<T>, selector: (state: T) => S): S {
	const [selected, setSelected] = useState(() => selector(store.get()));

	useEffect(() => {
		const update = () => setSelected(selector(store.get()));
		update();
		return store.subscribe(update);
	}, [store, selector]);

	return selected;
}
