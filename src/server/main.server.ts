import { registerShooterTriggerHandler } from "server/mounting/shooterTriggerHandler";
import { startMountServer } from "server/mounting/mountServer";
import { startPlayerEntities } from "server/playerEntities";
import { startWorldEntityStore } from "server/worldEcs/worldEntityStore";
import { initNetworkServer } from "shared/network";
import { startServerAuthorityReplicatedMotion } from "shared/serverAuthorityReplicatedMotion";

initNetworkServer();
startPlayerEntities();
startMountServer();
registerShooterTriggerHandler();
startWorldEntityStore();
startServerAuthorityReplicatedMotion({ mode: "server" });
