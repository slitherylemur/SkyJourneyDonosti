import { startMountServer } from "server/mounting/mountServer";
import { startPlayerEntities } from "server/playerEntities";
import { startProjectilePredictionServer } from "server/projectilePredictionServer";
import { startWorldEntityStore } from "server/worldEcs/worldEntityStore";
import { initNetworkServer } from "shared/network";
import { startServerAuthorityReplicatedMotion } from "shared/serverAuthorityReplicatedMotion";
import { startProjectileInputServer } from "shared/projectileInput";
import { initializeProjectileMotionTemplateServer } from "shared/projectileMotion";
import { startHomingProjectileSimulation } from "shared/homingProjectileSimulation";

initNetworkServer();
initializeProjectileMotionTemplateServer();
startProjectileInputServer();
startPlayerEntities();
startMountServer();
startWorldEntityStore();
startServerAuthorityReplicatedMotion({ mode: "server" });
startHomingProjectileSimulation();
startProjectilePredictionServer();
