import type { EntityRef } from "@rbxts/ecs";
import { CollectionService, HttpService } from "@rbxts/services";
import { Health } from "server/worldEcs/components";
import { getEcs } from "server/worldEcs/ecs";
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

export function applyHitPointDamage(id: string, rawDamage: number): void {
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
			health.current = math.max(0, health.current - rawDamage * link.multiplier);
		}
	}
}

export function getHitPoint(id: string): RegisteredHitPoint | undefined {
	return hitPoints.get(id);
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
