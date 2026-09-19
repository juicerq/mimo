import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/message-port";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "../main/router";

const { port1, port2 } = new MessageChannel();

window.postMessage("rpc", "*", [port2]);
port1.start();

export const rpc: RouterClient<Router> = createORPCClient(new RPCLink({ port: port1 }));

export const orpc = createTanstackQueryUtils(rpc);
