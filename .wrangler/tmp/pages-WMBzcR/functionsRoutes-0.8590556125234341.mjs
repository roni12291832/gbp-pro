import { onRequest as __api_ai_js_onRequest } from "/Users/ronilsonoleto/Downloads/GBP_Pro_Cloudflare_Pages/functions/api/ai.js"
import { onRequest as __api_places_js_onRequest } from "/Users/ronilsonoleto/Downloads/GBP_Pro_Cloudflare_Pages/functions/api/places.js"
import { onRequest as __claude_js_onRequest } from "/Users/ronilsonoleto/Downloads/GBP_Pro_Cloudflare_Pages/functions/claude.js"
import { onRequest as __places_js_onRequest } from "/Users/ronilsonoleto/Downloads/GBP_Pro_Cloudflare_Pages/functions/places.js"

export const routes = [
    {
      routePath: "/api/ai",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_ai_js_onRequest],
    },
  {
      routePath: "/api/places",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_places_js_onRequest],
    },
  {
      routePath: "/claude",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__claude_js_onRequest],
    },
  {
      routePath: "/places",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__places_js_onRequest],
    },
  ]