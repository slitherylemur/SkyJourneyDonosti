import { startMountServer } from "server/mounting/mountServer";
import { startPlayerEntities } from "server/playerEntities";
import { startProjectilePredictionServer } from "server/projectilePredictionServer";
import { startWorldEntityStore } from "server/worldEcs/worldEntityStore";
import { initNetworkServer } from "shared/network";
import { startServerAuthorityReplicatedMotion } from "shared/serverAuthorityReplicatedMotion";
import { startProjectileInputServer } from "shared/projectileInput";

initNetworkServer();
startProjectileInputServer();
startPlayerEntities();
startMountServer();
startWorldEntityStore();
startServerAuthorityReplicatedMotion({ mode: "server" });
startProjectilePredictionServer();
