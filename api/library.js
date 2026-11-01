import { loadLibrary } from "../lib/authorities.js";
import { send } from "../lib/http.js";

export default async function handler(req, res) {
  const { items } = await loadLibrary();
  send(res, 200, { items });
}
