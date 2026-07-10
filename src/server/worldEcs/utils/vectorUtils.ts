export const DEFAULT_FACING = new Vector3(0, 0, -1);

export function horizontal(vector: Vector3): Vector3 {
	return new Vector3(vector.X, 0, vector.Z);
}

export function horizontalMagnitude(vector: Vector3): number {
	return math.sqrt(vector.X * vector.X + vector.Z * vector.Z);
}

export function horizontalUnitOr(vector: Vector3, fallback: Vector3): Vector3 {
	const flat = horizontal(vector);
	const magnitude = horizontalMagnitude(flat);
	if (magnitude < 0.001) {
		return fallback;
	}
	return flat.div(magnitude);
}
