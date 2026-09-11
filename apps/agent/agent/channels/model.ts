import { defineChannel, GET } from "eve/channels";
import { listModels } from "../model";

export default defineChannel({
	routes: [GET("/mimo/models", async () => Response.json(await listModels()))],
});
