import type { EntityRef } from "@rbxts/ecs";
import { CollectionService, HttpService, Players } from "@rbxts/services";
import { Health, PlayerBoat } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
import { serverEvents } from "shared/network";
import {
	HIT_POINT_ID_ATTR,
	HIT_POINT_NAME,
	HIT_POINT_TAG,
	HIT_POINT_TEAM_ATTR,
	type HitPointTeam,
} from "shared/hitPointShared";

export interface HitPointLink {
	entity: EntityRef;
	multiplier: number;
}

export interface RegisteredHitPoint {
	attachment: Attachment;
	team: HitPointTeam;
	links: HitPointLink[];
}

export interface HitPointRayMatch {
	id: string;
	hitPoint: RegisteredHitPoint;
}

const hitPoints = new Map<string, RegisteredHitPoint>();
const entityHitPointIds = new Map<number, Set<string>>();

export function registerHitPoint(
	attachment: Attachment,
	team: HitPointTeam,
	links: HitPointLink[],
): RegisteredHitPoint {
	const existingId = attachment.GetAttribute(HIT_POINT_ID_ATTR);
	if (typeIs(existingId, "string")) {
		const existing = hitPoints.get(existingId);
		if (existing !== undefined) {
			for (const link of links) {
				if (!existing.links.some((candidate) => candidate.entity.id === link.entity.id)) {
					existing.links.push(link);
				}
				let ids = entityHitPointIds.get(link.entity.id);
				if (ids === undefined) {
					ids = new Set<string>();
					entityHitPointIds.set(link.entity.id, ids);
				}
				ids.add(existingId);
			}
			return existing;
		}
	}

	const id = HttpService.GenerateGUID(false);
	const registered: RegisteredHitPoint = { attachment, team, links: [...links] };
	hitPoints.set(id, registered);

	attachment.SetAttribute(HIT_POINT_ID_ATTR, id);
	attachment.SetAttribute(HIT_POINT_TEAM_ATTR, team);
	CollectionService.AddTag(attachment, HIT_POINT_TAG);

	for (const link of links) {
		let ids = entityHitPointIds.get(link.entity.id);
		if (ids === undefined) {
			ids = new Set<string>();
			entityHitPointIds.set(link.entity.id, ids);
		}
		ids.add(id);
	}

	return registered;
}

export function registerModelHitPoints(
	model: Model,
	team: HitPointTeam,
	links: HitPointLink[],
	include: (attachment: Attachment) => boolean = () => true,
): RegisteredHitPoint[] {
	const registered = new Array<RegisteredHitPoint>();
	for (const descendant of model.GetDescendants()) {
		if (descendant.IsA("Attachment") && descendant.Name === HIT_POINT_NAME && include(descendant)) {
			registered.push(registerHitPoint(descendant, team, links));
		}
	}

	if (registered.isEmpty()) {
		error(`[hitPointRegistry.ts] ${model.GetFullName()} has no ${HIT_POINT_NAME} attachments`);
	}
	return registered;
}

export function applyHitPointDamage(id: string, rawDamage: number, attackerPosition?: Vector3): void {
	const hitPoint = hitPoints.get(id);
	if (hitPoint === undefined || !hitPoint.attachment.IsDescendantOf(game)) {
		return;
	}

	const ecs = getEcs();
	for (const link of hitPoint.links) {
		if (!ecs.isEntityValid(link.entity)) {
			continue;
		}
		const health = ecs.getComponent(link.entity, Health);
		if (health !== undefined && health.current > 0) {
			const previousHealth = health.current;
			health.current = math.max(0, health.current - rawDamage * link.multiplier);
			if (health.current < previousHealth && ecs.getComponent(link.entity, PlayerBoat) !== undefined) {
				const directionSource = attackerPosition ?? hitPoint.attachment.WorldPosition;
				for (const player of Players.GetPlayers()) {
					serverEvents.fire(player, "ShipDamage", directionSource);
				}
			}
		}
	}
}

export function getHitPoint(id: string): RegisteredHitPoint | undefined {
	return hitPoints.get(id);
}

export function findEnemyHitPointAlongRay(
	origin: Vector3,
	direction: Vector3,
	maxRange: number,
	maxPerpendicularDistance: number,
): HitPointRayMatch | undefined {
	if (direction.Magnitude < 0.0001) {
		return undefined;
	}

	const unitDirection = direction.Unit;
	let best: HitPointRayMatch | undefined;
	let bestPerpendicular = math.huge;
	for (const [id, hitPoint] of hitPoints) {
		if (hitPoint.team !== "enemy" || !hitPoint.attachment.IsDescendantOf(game.Workspace)) {
			continue;
		}
		const offset = hitPoint.attachment.WorldPosition.sub(origin);
		const along = offset.Dot(unitDirection);
		if (along <= 0 || along > maxRange) {
			continue;
		}
		const perpendicular = offset.sub(unitDirection.mul(along)).Magnitude;
		if (perpendicular <= maxPerpendicularDistance && perpendicular < bestPerpendicular) {
			bestPerpendicular = perpendicular;
			best = { id, hitPoint };
		}
	}
	return best;
}

export function getEntityHitPoints(entity: EntityRef): RegisteredHitPoint[] {
	const ids = entityHitPointIds.get(entity.id);
	if (ids === undefined) {
		return [];
	}

	const result = new Array<RegisteredHitPoint>();
	for (const id of ids) {
		const hitPoint = hitPoints.get(id);
		if (hitPoint !== undefined) {
			result.push(hitPoint);
		}
	}
	return result;
}

export function unregisterEntityHitPoints(entity: EntityRef): void {
	const ids = entityHitPointIds.get(entity.id);
	if (ids === undefined) {
		return;
	}
	entityHitPointIds.delete(entity.id);

	for (const id of ids) {
		const hitPoint = hitPoints.get(id);
		if (hitPoint === undefined) {
			continue;
		}
		hitPoint.links = hitPoint.links.filter((link) => link.entity.id !== entity.id);
		if (!hitPoint.links.isEmpty()) {
			continue;
		}

		hitPoints.delete(id);
		CollectionService.RemoveTag(hitPoint.attachment, HIT_POINT_TAG);
		hitPoint.attachment.SetAttribute(HIT_POINT_ID_ATTR, undefined);
		hitPoint.attachment.SetAttribute(HIT_POINT_TEAM_ATTR, undefined);
	}
}
