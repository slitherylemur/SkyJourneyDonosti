import { startWorldEntityStore } from "server/worldEcs/worldEntityStore";
import { startServerAuthorityReplicatedMotion } from "shared/serverAuthorityReplicatedMotion";

startWorldEntityStore();
startServerAuthorityReplicatedMotion({ mode: "server" });
